"""SQLAlchemy ORM models — single source of truth for all persistent tables."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, JSON, String, Text, UniqueConstraint


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


try:
    from sqlalchemy.orm import DeclarativeBase

    class Base(DeclarativeBase):
        pass

except ImportError:
    from sqlalchemy.orm import declarative_base
    Base = declarative_base()  # type: ignore[assignment]


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    org_id = Column(String(36), nullable=True)
    settings = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    archived_at = Column(DateTime(timezone=True), nullable=True)


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), index=True, nullable=False)
    name = Column(String(500), nullable=False)
    status = Column(String(50), default="active")
    version = Column(Integer, default=1)
    priority = Column(String(10), default="P1")
    tags = Column(JSON, default=list)
    spec = Column(JSON, nullable=False)
    created_by = Column(String(255), nullable=True)
    last_run_status = Column(String(50), nullable=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_run_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class TestSuite(Base):
    __tablename__ = "test_suites"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), index=True, nullable=False)
    name = Column(String(500), nullable=False)
    description = Column(Text, default="")
    test_case_ids = Column(JSON, default=list)
    group = Column(String(255), nullable=True)
    pass_rate = Column(Float, default=0.0)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    archived_at = Column(DateTime(timezone=True), nullable=True)


class SuiteSchedule(Base):
    __tablename__ = "suite_schedules"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), index=True, nullable=False)
    suite_id = Column(String(36), index=True, nullable=False)
    cron = Column(String(100), nullable=False)
    branch = Column(String(255), nullable=True, default="main")
    enabled = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class VaultSecret(Base):
    __tablename__ = "vault_secrets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), index=True, nullable=False)
    key = Column(String(255), nullable=False)
    encrypted_value = Column(Text, nullable=False)
    iv = Column(String(100), default="")
    environment = Column(String(100), default="Development")
    secret_type = Column(String(50), default="API Key")
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    __table_args__ = (UniqueConstraint("project_id", "key", name="uq_vault_secret_project_key"),)


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), index=True, nullable=False)
    user_email = Column(String(255), nullable=False)
    user_name = Column(String(255), nullable=True)
    role = Column(String(20), nullable=False, default="viewer")  # admin|developer|viewer
    added_at = Column(DateTime(timezone=True), default=_utcnow)

    __table_args__ = (UniqueConstraint("project_id", "user_email", name="uq_project_member"),)
