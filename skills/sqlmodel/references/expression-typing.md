# SQLModel Expression Typing

This reference documents how SQLModel provides type-safe `select()` and `Session.exec()` overloads.

## select() Overloads

**Files:** `sqlmodel/sql/_expression_select_gen.py` (generated), `sqlmodel/sql/_expression_select_cls.py`

`select()` is a generated function with overloads for up to 4 entities. The source is a Jinja2 template (`_expression_select_gen.py.jinja2`) processed by `scripts/generate_select.py`.

### Runtime Behavior

```python
def select(*entities: _TCCA[_T0]) -> SelectOfScalar[_T0]: ...
def select(*entities: _TCCA[_T0], _TCCA[_T1]) -> Select[tuple[_T0, _T1]]: ...
# ... up to 4 entities
```

- 1 entity → `SelectOfScalar[_T0]`
- 2+ entities → `Select[tuple[_T0, _T1, ...]]`

### Type Classes

`_TCCA` is a type variable bound to `ColumnElement` or SQLModel class. This allows both:
- `select(Hero)` → `SelectOfScalar[Hero]`
- `select(Hero.id, Hero.name)` → `Select[tuple[int, str]]`

### Select Classes

```python
class SelectBase(Select[_T]): ...
class Select(SelectBase[_T]): ...
class SelectOfScalar(SelectBase[_T]): ...
```

`SelectOfScalar` is a tagged `Select` subclass. It carries no runtime behavior difference from `Select`. The tag is read by `Session.exec()`.

### Preserving Types Through Chaining

`SelectBase.where()` and `SelectBase.having()` override the parent methods and return `Self`:

```python
def where(self, *whereclause: _ColumnExpressionArgument[bool]) -> Self: ...
```

This preserves the generic type through method chaining:

```python
select(Hero).where(Hero.age > 30)  # still SelectOfScalar[Hero]
```

## Session.exec() Overloads

**Files:** `sqlmodel/orm/session.py`, `sqlmodel/ext/asyncio/session.py`

```python
@overload
def exec(self, statement: Select[_T]) -> TupleResult[_T]: ...
@overload
def exec(self, statement: SelectOfScalar[_T]) -> ScalarResult[_T]: ...
@overload
def exec(self, statement: UpdateBase) -> CursorResult[Any]: ...
```

### Runtime Scalar Auto-Application

```python
def exec(self, statement, *args, **kwargs):
    results = super().execute(statement, *args, **kwargs)
    if isinstance(statement, SelectOfScalar):
        return results.scalars()
    return results
```

If the statement is a `SelectOfScalar`, `.scalars()` is called automatically. Otherwise, the raw `Result` is returned.

This removes the common boilerplate:
```python
# SQLAlchemy native
results = session.execute(select(Hero)).scalars().all()

# SQLModel
results = session.exec(select(Hero)).all()
```

## AsyncSession.exec()

**File:** `sqlmodel/ext/asyncio/session.py:69`

```python
async def exec(self, statement, *args, **kwargs):
    return await greenlet_spawn(
        self.sync_session.exec, statement, *args, **kwargs
    )
```

Delegates to the sync `Session.exec()` via SQLAlchemy's `greenlet_spawn`. The sync session class is set via `sync_session_class = Session`.

## col() Helper

**File:** `sqlmodel/sql/expression.py:199`

```python
def col(column: _T) -> _T:
    if isinstance(column, (ColumnClause, Column, InstrumentedAttribute)):
        return column
    # ... type-only path
```

`col()` exists purely for typing. It allows SQLModel's `select()` overloads to accept both raw Python types and SQLAlchemy column expressions. At runtime, it simply returns the input unchanged if it is already a column-like object.

## Important Notes

- `_expression_select_gen.py` is generated from a Jinja2 template. Editing the `.py` directly breaks `test_select_gen.py`.
- The overloads support up to 4 entities mixing model classes and scalar columns.
- `SelectOfScalar` is NOT the same as SQLAlchemy's `ScalarSelect`. It is a normal `Select` with a runtime type tag.
