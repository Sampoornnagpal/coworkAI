from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from backend.auth.utils import get_current_user
from backend.rag.indexer import load_file, chunk_text, embed_and_store
from backend.database import get_db
from pydantic import BaseModel

router = APIRouter()

class DocumentResponse(BaseModel):
    id: int
    filename: str
    team_id: int
    chunk_count: int
    uploaded_by: int
    created_at: str

@router.post("/upload")
def upload_document(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    team_id = user["team_id"]
    user_id = user["id"]
    
    # Read file bytes
    file_bytes = file.file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")
    
    # Extract text
    try:
        text = load_file(file_bytes, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {str(e)}")
    
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text content found in file")
    
    # Chunk text
    chunks = chunk_text(text)
    if not chunks:
        raise HTTPException(status_code=400, detail="No chunks generated from file")
    
    # Save document record to SQLite
    db = get_db()
    cursor = db.execute(
        "INSERT INTO documents (filename, team_id, chunk_count, uploaded_by) VALUES (?, ?, ?, ?)",
        (file.filename, team_id, len(chunks), user_id)
    )
    doc_id = cursor.lastrowid
    db.commit()
    db.close()
    
    # Embed and store in ChromaDB
    embed_and_store(chunks, team_id, doc_id, file.filename)
    
    return {
        "message": "Document uploaded and indexed",
        "doc_id": doc_id,
        "filename": file.filename,
        "chunk_count": len(chunks)
    }

@router.get("/documents")
def list_documents(user: dict = Depends(get_current_user)):
    team_id = user["team_id"]
    db = get_db()
    rows = db.execute(
        "SELECT * FROM documents WHERE team_id = ? ORDER BY created_at DESC",
        (team_id,)
    ).fetchall()
    db.close()
    return [dict(row) for row in rows]

@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int, user: dict = Depends(get_current_user)):
    team_id = user["team_id"]
    db = get_db()
    
    # Verify document belongs to user's team
    doc = db.execute(
        "SELECT * FROM documents WHERE id = ? AND team_id = ?",
        (doc_id, team_id)
    ).fetchone()
    
    if not doc:
        db.close()
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete from SQLite
    db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    db.commit()
    db.close()
    
    # Delete chunks from ChromaDB
    from backend.rag.indexer import get_team_collection
    collection = get_team_collection(team_id)
    try:
        # Get all chunk IDs for this document
        chunk_ids = [f"doc{doc_id}_chunk{i}" for i in range(doc["chunk_count"])]
        collection.delete(ids=chunk_ids)
    except Exception:
        pass  # Best effort deletion from vector store
    
    return {"message": "Document deleted", "doc_id": doc_id}
