# SQLModel Compatibility Layer

This reference documents `sqlmodel/_compat.py`, the bridge between SQLModel and Pydantic/SQLAlchemy versions.

## Key Functions

### `get_model_fields(model)`

Wrapper around `model.model_fields` (Pydantic v2). Provides a stable API regardless of Pydantic version.

### `is_table_model_class(model)`

Checks `model_config.get("table")`. Returns `True` if the model was declared with `table=True`.

### `get_relationship_to(name, rel_info, annotation)`

Resolves relationship target type from annotation. Handles:
- `Optional[T]` → unwraps to `T`
- `list[T]` → unwraps to `T`
- `ForwardRef` → resolves via `_eval_type`
- `Mapped[T]` → unwraps to `T`

Used by `SQLModelMetaclass.__init__` to determine the target class for SQLAlchemy `relationship()`.

### `is_field_noneable(field)`

Determines whether a field should be nullable:
1. If `nullable` explicitly set in `FieldInfo`, return that
2. If annotation is `Optional[T]` or `T | None`, return `True`
3. Otherwise return `False`

### `sqlmodel_table_construct(self_instance, values)`

Low-level constructor for table models. Called from `sqlmodel_init` when the model is a table class.

Key behavior: uses `setattr(self_instance, key, value)` for all field values instead of direct `__dict__` assignment. This ensures SQLAlchemy instrumentation fires for each attribute.

After setting all fields:
- Restores `__pydantic_fields_set__`
- Sets any relationship values from `__sqlmodel_relationships__`

### `sqlmodel_validate(cls, obj)`

Wrapper for `SQLModel.model_validate`. Handles the table model path:

1. Enters `partial_init()` context (`finish_init = False`)
2. Creates instance with `cls()` to trigger SQLAlchemy's instrumented `__init__`
3. Runs Pydantic validation with `self_instance=new_obj`
4. Copies validated attributes back via `setattr` to preserve SQLAlchemy events
5. Restores `__pydantic_fields_set__`

### `sqlmodel_init(self, data)`

Called from `SQLModel.__init__`. Dispatches:
- Non-table models → `self.__pydantic_validator__.validate_python(data, self_instance=self)`
- Table models → `sqlmodel_table_construct(self_instance=self, values=data)`

### `finish_init` / `partial_init`

**File:** `sqlmodel/_compat.py:69-72`

```python
finish_init: ContextVar[bool] = ContextVar("finish_init", default=True)

@contextmanager
def partial_init() -> Generator[None, None, None]:
    token = finish_init.set(False)
    try:
        yield
    finally:
        finish_init.reset(token)
```

`finish_init` is a `ContextVar` controlling whether `SQLModel.__init__` runs full Pydantic validation.

Used by:
- `model_validate` for table models (prevents double-validation during SQLAlchemy state creation)
- SQLAlchemy's internal result loading (SQLAlchemy calls `__init__` on loaded instances, but validation must be skipped)

## SQLModelConfig

**File:** `sqlmodel/_compat.py:78`

Pydantic `ConfigDict` subclass adding:
- `table: bool` — whether the model is mapped to a database table
- `registry: registry | None` — custom SQLAlchemy registry

Accessed via `model_config.get("table")` and `model_config.get("registry")`.

## Version Matrix

`_compat.py` contains version-specific shims for Pydantic compatibility. SQLModel supports Pydantic v2. The compat layer abstracts differences so the rest of the codebase uses stable APIs.
