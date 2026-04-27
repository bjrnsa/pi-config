---
name: sqlmodel
description:
  Expert guidance for SQLModel, the library that unifies Pydantic and SQLAlchemy into a single model class. Use this skill whenever the user mentions SQLModel, wants to combine Pydantic and SQLAlchemy, is building database models for FastAPI, needs ORM models that also validate data, asks about table=True, Field(), Relationship(), select(), session management, or database integration in Python. Also use when the user asks about FastAPI CRUD patterns with SQLModel, reducing duplication between API schemas and database tables, or SQLAlchemy declarative models with Pydantic validation. Trigger even if the user only says "database models" or "ORM" in a FastAPI context, or asks about migration patterns, query typing, or session dependency injection with SQLModel.
---

# SQLModel

SQLModel is a thin compatibility layer that makes a single Python class behave as both a Pydantic v2 model and a SQLAlchemy 2.x declarative table. Its purpose is to eliminate the duplication you normally get when defining a SQLAlchemy ORM class for the database and a separate Pydantic model for request/response validation.

## When to Use SQLModel

## Reference Files

For deeper technical details, read these references as needed:

- `@metaclass-internals.md` — How SQLModelMetaclass orchestrates Pydantic + SQLAlchemy construction, instance lifecycle, and the `finish_init` context variable.
- `@expression-typing.md` — How `select()`, `SelectOfScalar`, and `Session.exec()` overloads provide type-safe query building.
- `@compat-layer.md` — The `_compat.py` bridge between SQLModel and Pydantic/SQLAlchemy versions.

## When to Use SQLModel

Use SQLModel when:
- Your API request/response shapes closely match your database tables
- You want one class to serve as both DB model and Pydantic schema
- You are building FastAPI apps and want typed `select()` builders with autocompletion
- You want reduced boilerplate: `session.exec(select(Hero)).all()` instead of `session.execute(select(Hero)).scalars().all()`
- You need inheritance chains like `HeroCreate` → `HeroPublic` → `Hero` (table=True) to share fields without copy-pasting annotations

## When NOT to Use SQLModel

Do NOT use SQLModel when:
- Your API and DB schemas diverge significantly (computed fields, heavy denormalization, wildly different read vs write models). The tutorial explicitly warns against creating a "crazy tree" of inheritance — create independent models instead.
- You need exotic SQLAlchemy patterns (legacy mapper configurations, advanced `Column` args that conflict with `Field()`, non-standard type mappings). Drop to raw SQLAlchemy for those columns or tables.
- You need rich Pydantic validation on relationship fields. Relationships are stripped from Pydantic's `model_fields` and owned entirely by SQLAlchemy.
- Your project is migration-heavy and schema-driven. SQLModel has no migration story; you will use Alembic directly anyway, and at that point you are already managing raw SQLAlchemy metadata.
- You need complex unions or collection columns (`list[str]`, `dict[str, Any]`, `int | str`). These raise `ValueError` at definition time because they do not map cleanly to SQLAlchemy columns.

## Model Definition

### Table vs. Non-Table Models

```python
from sqlmodel import SQLModel, Field

# Pydantic-only schema (no table)
class HeroCreate(SQLModel):
    name: str
    age: int | None = None

# Table model (both Pydantic and SQLAlchemy)
class Hero(HeroCreate, table=True):
    id: int | None = Field(default=None, primary_key=True)
```

Key rule: `table=True` enables SQLAlchemy mapping. Models without it are pure Pydantic schemas. Inherit from non-table schemas into table models to share fields.

### Primary Keys and Auto-Increment

Always type auto-increment primary keys as `int | None`:

```python
id: int | None = Field(default=None, primary_key=True)
```

The `None` is required because before insertion the Python object has no ID. This is a typing compromise, not a runtime requirement.

### Field() Parameters

`Field()` accepts both Pydantic constraints and SQLAlchemy column arguments:

```python
name: str = Field(index=True, max_length=100)  # SQLAlchemy index + Pydantic max_length
secret_name: str = Field(sa_column=Column("secret_name", String(100), nullable=False))
```

Mutual exclusivity rule: `sa_column` cannot be mixed with `primary_key`, `nullable`, `foreign_key`, `sa_type`, `unique`, `index`, or `ondelete`. Choose high-level SQLModel sugar OR raw SQLAlchemy `Column`, never both in the same `Field()`.

### Foreign Keys

```python
class Hero(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    team_id: int | None = Field(default=None, foreign_key="team.id")
```

Use `ondelete` for cascade behavior at the database level:

```python
team_id: int | None = Field(default=None, foreign_key="team.id", ondelete="SET NULL")
```

`ondelete="SET NULL"` requires `nullable=True` on the field.

## Relationships

### Declaration

```python
from sqlmodel import Relationship

class Team(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    heroes: list["Hero"] = Relationship(back_populates="team")

class Hero(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    team_id: int | None = Field(default=None, foreign_key="team.id")
    team: Team | None = Relationship(back_populates="heroes")
```

Relationships are invisible to Pydantic. They do not appear in `model_fields`, cannot be validated by Pydantic, and are not included in FastAPI OpenAPI schemas by default. If you need to expose relationships in API responses, create a separate response model that includes the related model as a regular field:

```python
class HeroPublicWithTeam(HeroPublic):
    team: TeamPublic | None = None
```

### Cascade Delete

```python
heroes: list["Hero"] = Relationship(back_populates="team", cascade_delete=True)
```

This translates to SQLAlchemy `cascade="all, delete-orphan"`. Requires database-level foreign key support.

### Many-to-Many with Link Model

```python
class HeroTeamLink(SQLModel, table=True):
    team_id: int | None = Field(default=None, foreign_key="team.id", primary_key=True)
    hero_id: int | None = Field(default=None, foreign_key="hero.id", primary_key=True)

class Team(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    heroes: list["Hero"] = Relationship(back_populates="teams", link_model=HeroTeamLink)

class Hero(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    teams: list[Team] = Relationship(back_populates="heroes", link_model=HeroTeamLink)
```

### Circular Imports

Circular imports between models in separate files are not supported at runtime. Use `if TYPE_CHECKING:` imports plus string annotations:

```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .team_model import Team

class Hero(SQLModel, table=True):
    team_id: int | None = Field(default=None, foreign_key="team.id")
    team: "Team" = Relationship(back_populates="heroes")
```

## Queries and Sessions

### Typed select()

```python
from sqlmodel import select, Session

with Session(engine) as session:
    statement = select(Hero).where(Hero.age > 30)
    results = session.exec(statement).all()  # list[Hero], scalars applied automatically
```

`select(Hero)` returns `SelectOfScalar[Hero]`, so `session.exec()` auto-calls `.scalars()`.

`select(Hero.id, Hero.name)` returns `Select[tuple[int, str]]`, giving tuple results.

### Async Sessions

```python
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine("sqlite+aiosqlite:///database.db")

async with AsyncSession(engine) as session:
    statement = select(Hero).where(Hero.age > 30)
    results = await session.exec(statement)
    heroes = results.all()
```

AsyncSession delegates to the sync `Session.exec()` via SQLAlchemy's `greenlet_spawn`. `sqlmodel.ext.asyncio.session.AsyncSession` is a thin subclass of SQLAlchemy's `AsyncSession` that sets `sync_session_class = Session` (the SQLModel sync session) so typed `exec()` behavior is preserved across the async boundary.

### CRUD Patterns

```python
# Create
hero = Hero(name="Deadpond", age=30)
session.add(hero)
session.commit()
session.refresh(hero)  # Refresh to get auto-generated fields like id

# Read by primary key
hero = session.get(Hero, 1)

# Update
hero.age = 31
session.add(hero)
session.commit()

# Delete
session.delete(hero)
session.commit()
```

### Partial Updates (PATCH)

```python
from sqlmodel import SQLModel

class HeroUpdate(SQLModel):
    name: str | None = None
    age: int | None = None

hero.sqlmodel_update(hero_update.model_dump(exclude_unset=True))
session.add(hero)
session.commit()
```

`sqlmodel_update()` is a built-in helper for PATCH-style updates that respects Pydantic field semantics.

## FastAPI Integration

### Session Dependency

```python
from fastapi import Depends, FastAPI
from sqlmodel import Session, create_engine

engine = create_engine("sqlite:///database.db")

def get_session():
    with Session(engine) as session:
        yield session

app = FastAPI()

@app.post("/heroes/")
def create_hero(*, session: Session = Depends(get_session), hero: HeroCreate):
    db_hero = Hero.model_validate(hero)
    session.add(db_hero)
    session.commit()
    session.refresh(db_hero)
    return db_hero
```

Table models automatically have `model_config["read_from_attributes"] = True`, so FastAPI serializes from ORM attributes directly without premature dict conversion.

### Multiple Models Pattern

```python
class HeroBase(SQLModel):
    name: str
    age: int | None = None
    secret_name: str

class HeroCreate(HeroBase):
    pass

class HeroPublic(HeroBase):
    id: int

class Hero(HeroBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
```

This pattern separates write schemas (`HeroCreate`), read schemas (`HeroPublic`), and the table model (`Hero`). Inherit shared fields from `HeroBase`.

## Table Creation and Migrations

### Creating Tables

```python
from sqlmodel import SQLModel, create_engine

engine = create_engine("sqlite:///database.db")
SQLModel.metadata.create_all(engine)
```

This is pure SQLAlchemy. `SQLModel.metadata` is the global `MetaData` from the default registry.

### Migrations

SQLModel provides NO migration tooling. For production, use Alembic directly:

```bash
alembic init migrations
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

Alembic works with SQLModel because SQLModel table models are standard SQLAlchemy declarative classes. No special integration is required.

## Testing

### Test Fixture Pattern

```python
import pytest
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import StaticPool

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
```

Always use an in-memory SQLite database with `StaticPool` for tests. Call `SQLModel.metadata.create_all(engine)` before yielding the session.

### FastAPI Test Override

```python
from fastapi.testclient import TestClient

app.dependency_overrides[get_session] = session_fixture
client = TestClient(app)
```

Override the `get_session` dependency with your test fixture.

## AutoString and Type Mapping

SQLModel's `get_sqlalchemy_type` maps Python types to SQLAlchemy types automatically:

- `str` → `AutoString` (adds default length 255 on MySQL; unbounded on PostgreSQL/SQLite)
- `int` → `Integer`
- `float` → `Float`
- `bool` → `Boolean`
- `datetime` → `DateTime`
- `date` → `Date`
- `time` → `Time`
- `timedelta` → `Interval`
- `bytes` → `LargeBinary`
- `decimal.Decimal` → `Numeric`
- `uuid.UUID` → `GUID` (or `CHAR(32)` on SQLite)
- `enum.Enum` / `Literal` → `Enum`

For custom types, use `sa_type`:

```python
from sqlalchemy import JSON

data: dict[str, Any] = Field(sa_type=JSON)
```

## Key Gotchas

- **Relationships are invisible to Pydantic**: They are stripped from `model_fields` during class creation. SQLAlchemy owns them entirely.
- **`finish_init` context variable**: Controls whether `__init__` runs full Pydantic validation. SQLAlchemy's instrumentation calls `__init__` during result loading with this flag off to avoid double validation. You do not interact with this directly, but it explains why table models behave differently during `model_validate` vs normal construction.
- **`base_is_table` guard**: Prevents SQLAlchemy re-mapping when FastAPI clones models for `response_model`. Without it, SQLAlchemy would attempt to register a second table with the same name.
- **Keyword `.where()` is unsupported**: You must use expression operators (`Hero.age > 30`). `select(Hero).where(name="Deadpond")` is deliberately not supported because keyword arguments defeat static type checking and editor autocompletion.
- **Generated `select()` overloads**: `_expression_select_gen.py` is generated from a Jinja2 template. Overloads support up to 4 entities mixing columns and scalars.
- **SQLite limitations**: No native `Decimal` support (converts to floating `NUMERIC`), no native UUID type (stores as string), foreign key constraints are off by default.
- **`read_with_orm_mode` is deprecated**: `model_config["read_with_orm_mode"]` is a lingering compatibility shim for older FastAPI versions. Modern code uses `read_from_attributes`.
