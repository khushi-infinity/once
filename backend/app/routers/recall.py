"""Grounded recall endpoint. Logic lives in app.services.recall (shared with MCP)."""
from fastapi import APIRouter, HTTPException

from app.models.api import RecallRequest, RecallResponse
from app.services.recall import RecallNoMatch, recall_for_reader

router = APIRouter(prefix="/api", tags=["recall"])


@router.post("/recall", response_model=RecallResponse)
def recall(req: RecallRequest) -> RecallResponse:
    try:
        return recall_for_reader(req.reader_id, req.query, req.have)
    except RecallNoMatch as exc:
        detail = str(exc)
        if exc.available:
            detail += f" Skills available to {req.reader_id}: {', '.join(exc.available)}."
        raise HTTPException(status_code=404, detail=detail) from exc
