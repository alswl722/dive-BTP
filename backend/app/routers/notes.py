from fastapi import APIRouter, HTTPException, Query

from app.schemas import Note, NoteCreate, NoteUpdate
from app.services import notes as notes_service

router = APIRouter(tags=["notes"])


@router.get("/notes", response_model=list[Note])
def list_notes(
    companyId: int | None = Query(None, description="이 기업이 언급된 메모만"),
    programYear: int | None = Query(None),
    programCode: str | None = Query(None),
):
    return notes_service.list_notes(
        company_id=companyId, program_year=programYear, program_code=programCode
    )


@router.post("/notes", response_model=Note, status_code=201)
def create_note(body: NoteCreate):
    return notes_service.create_note(body.body, body.author)


@router.patch("/notes/{note_id}", response_model=Note)
def update_note(note_id: int, body: NoteUpdate):
    note = notes_service.update_note(note_id, body.body)
    if note is None:
        raise HTTPException(status_code=404, detail=f"note_id={note_id} 없음")
    return note


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: int):
    if not notes_service.delete_note(note_id):
        raise HTTPException(status_code=404, detail=f"note_id={note_id} 없음")
