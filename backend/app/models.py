from __future__ import annotations
from datetime import date as DateType
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

Category = Literal["Dining", "Fuel", "Shopping", "Subscriptions", "Food delivery", "Income", "Bills", "Other"]

class Transaction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    merchant: str = Field(min_length=1, max_length=120)
    date: DateType | None = None
    category: Category = "Other"
    amount: float
    raw_line: str | None = None

class Statement(BaseModel):
    transactions: list[Transaction] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)

class AuditRequest(BaseModel):
    transactions: list[Transaction]
    goal: str = "Audit my transactions for subscription traps and silent price hikes."

class ApprovalRequest(BaseModel):
    decision: Literal["approve", "reject"]
    reason: str | None = None

class AgentDecision(BaseModel):
    tool_name: Literal["detect_stealth_hikes", "calculate_annual_leakage", "generate_cancellation_script", "finish"]
    arguments: dict = Field(default_factory=dict)
    message: str = ""
