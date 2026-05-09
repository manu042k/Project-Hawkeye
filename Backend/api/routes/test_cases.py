from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter

from api.schemas import TestCaseInfo, TestCaseListResponse
from orchestrator.loader.yaml_loader import load_test_case

router = APIRouter(prefix="/test-cases", tags=["test-cases"])

_TEST_CASES_DIR = Path(__file__).parent.parent.parent / "orchestrator" / "test_cases"


@router.get("", response_model=TestCaseListResponse)
async def list_test_cases() -> TestCaseListResponse:
    cases = []
    for yaml_path in sorted(_TEST_CASES_DIR.glob("*.yaml")):
        try:
            tc = load_test_case(yaml_path)
            cases.append(TestCaseInfo(
                id=tc.id,
                name=tc.name,
                path=str(yaml_path),
                goal=tc.goal,
                browser=tc.target.browser,
                assertions=len(tc.assertions),
            ))
        except Exception:
            continue
    return TestCaseListResponse(test_cases=cases)


@router.post("/validate")
async def validate_test_case(body: dict) -> dict:
    path = body.get("path", "")
    try:
        load_test_case(path)
        return {"valid": True, "error": None}
    except Exception as exc:
        return {"valid": False, "error": str(exc)}
