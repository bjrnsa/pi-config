# SQLModel Metaclass Internals

This reference documents the technical implementation of how SQLModel unifies Pydantic and SQLAlchemy at the metaclass level.

## The Core Problem

Pydantic v2 and SQLAlchemy 2.x both use metaclasses:
- Pydantic: `ModelMetaclass` (builds `model_fields`, validators, `model_config`)
- SQLAlchemy: `DeclarativeMeta` (maps classes to `Table` objects, instruments attributes)

A class cannot directly inherit from two metaclasses. SQLModel solves this by making `SQLModelMetaclass` inherit from both, then carefully orchestrating which metaclass does what work.

## Two-Phase Construction

### Phase 1: `__new__` — Pydantic Field Discovery + Column Attachment

**File:** `sqlmodel/main.py:534`

When `class Hero(SQLModel, table=True)` is declared, `SQLModelMetaclass.__new__` runs first.

**Step 1: Split relationship fields from Pydantic fields**

The metaclass scans the class dict. Any field value that is a `RelationshipInfo` is pulled out into a private `__sqlmodel_relationships__` dict. Regular fields go into `dict_for_pydantic`.

Annotations are split the same way:
- `pydantic_annotations`: non-relationship fields (Pydantic will see these)
- `relationship_annotations`: relationship fields (hidden from Pydantic temporarily)

**Step 2: Build filtered namespace for Pydantic**

The filtered dict contains:
- `dict_for_pydantic` (regular fields)
- `__weakref__ = None`
- `__sqlmodel_relationships__` (relationship metadata for later)
- `__annotations__ = pydantic_annotations` (only non-relationship annotations)

This dict is passed up the MRO to `Pydantic ModelMetaclass.__new__`.

**Step 3: Pydantic builds the class**

Pydantic resolves annotations, compiles validators, builds `model_fields`, sets `model_config`, etc. Because relationship annotations were hidden, Pydantic never tries to build validators for them.

**Step 4: Restore annotations and attach SQLAlchemy Columns**

After Pydantic returns `new_cls`:
1. Full annotations are restored: `new_cls.__annotations__ = relationship_annotations + pydantic_annotations + new_cls.__annotations__`
2. If `config_table` is True, iterate `get_model_fields(new_cls)` and call `get_column_from_field(v)` for each field
3. Attach each returned SQLAlchemy `Column` via `setattr(new_cls, k, col)`
4. Set `model_config["read_from_attributes"] = True` for FastAPI ORM-mode
5. If `registry` passed, set `_sa_registry`, `metadata`, and `__abstract__ = True`

### Phase 2: `__init__` — Relationship Wiring + SQLAlchemy Mapping

**File:** `sqlmodel/main.py:610`

After `__new__` returns the class object, `__init__` runs.

**Guard: `base_is_table`**

```python
base_is_table = any(is_table_model_class(base) for base in bases)
```

If the current class is a table model but none of its bases are, proceed. This prevents FastAPI from re-mapping cloned response models.

**Wire relationships**

For each `RelationshipInfo`:
1. If `rel_info.sa_relationship` exists, set it directly and skip the rest
2. Read annotation from `cls.__annotations__[rel_name]`
3. Unwrap `Optional`, `list`, `ForwardRef` via `get_relationship_to` to find target model
4. If annotation not wrapped in `Mapped[...]`, wrap it (SQLAlchemy 2.x needs this)
5. Build kwargs for SQLAlchemy `relationship()`: `back_populates`, `cascade_delete` → `cascade="all, delete-orphan"`, `passive_deletes`, `link_model` → `secondary` via `inspect(link_model).local_table`
6. Call SQLAlchemy `relationship()` and attach descriptor: `setattr(cls, rel_name, rel_value)`

**SQLAlchemy mapping**

Call `DeclarativeMeta.__init__`, which invokes `_as_declarative()`. SQLAlchemy finds the `Column` and `relationship()` descriptors already on the class and maps it to a `Table`.

## Instance Lifecycle

### `SQLModel.__new__`

**File:** `sqlmodel/main.py:822`

Always calls `super().__new__(cls)` then `init_pydantic_private_attrs()` to set `__pydantic_fields_set__`, `__pydantic_extra__`, `__pydantic_private__`. This is required because SQLAlchemy does not call `__init__` when loading instances from the database.

### `SQLModel.__init__`

**File:** `sqlmodel/main.py:830`

Checks `finish_init` context variable (default `True`):
- If `True`: calls `sqlmodel_init()`
- If `False`: skips (used during SQLAlchemy result loading and `model_validate`)

### `sqlmodel_init` / `sqlmodel_table_construct`

**File:** `sqlmodel/_compat.py:329`

For non-table models: runs Pydantic validation directly.

For table models: calls `sqlmodel_table_construct` which:
- Iterates `model_fields`, resolves defaults
- Sets every attribute via `setattr` (NOT `__dict__` assignment) so SQLAlchemy instrumentation fires
- Restores `__pydantic_fields_set__`
- Sets any relationship values

### `model_validate` (table model path)

**File:** `sqlmodel/main.py:868`

Uses `partial_init()` context (sets `finish_init = False`):
1. Call `cls()` to trigger SQLAlchemy's instrumented `__init__` and create `_sa_instance_state`
2. Run Pydantic validation with `self_instance=new_obj`
3. Copy validated attributes back via `setattr` to preserve SQLAlchemy events
4. Restore `__pydantic_fields_set__`

### `SQLModel.__setattr__`

**File:** `sqlmodel/main.py:840`

For table models:
1. If name is `_sa_instance_state`, write directly to `__dict__`
2. Else if attribute is SQLAlchemy-instrumented, call `set_attribute(self, name, value)` first
3. Then, if name is not a relationship field, call `super().__setattr__` (Pydantic) to update Pydantic's internal state

## Why This Architecture

The split between `__new__` and `__init__` is required because:
- Pydantic v2 does heavy field compilation in `__new__`
- SQLAlchemy 2.x does table mapping in `__init__` (via `_as_declarative`)

If both ran in `__new__`, SQLAlchemy would try to map before Pydantic had finished building `model_fields`, causing circular dependencies.

The `finish_init` context variable prevents a deadlock: SQLAlchemy's result-loading calls `__init__` on instances, but if Pydantic validation also ran, it would re-validate database values and potentially fail on None/null mismatches.
