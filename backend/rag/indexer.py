import chromadb
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from backend.config import settings
import os
import io

# Initialize once at module level
_model = None
_chroma_client = None

def get_embed_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(settings.EMBEDDING_MODEL)
    return _model

def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        os.makedirs(settings.CHROMA_PATH, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PATH)
    return _chroma_client

def get_team_collection(team_id: int):
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=f"team_{team_id}",
        metadata={"hnsw:space": "cosine"}
    )

def load_file(file_bytes: bytes, filename: str) -> str:
    if filename.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(file_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    else:
        return file_bytes.decode("utf-8")

def chunk_text(text: str) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    return splitter.split_text(text)

def embed_and_store(chunks: list[str], team_id: int, doc_id: int, filename: str):
    model = get_embed_model()
    collection = get_team_collection(team_id)
    embeddings = model.encode(chunks).tolist()
    
    collection.add(
        documents=chunks,
        embeddings=embeddings,
        ids=[f"doc{doc_id}_chunk{i}" for i in range(len(chunks))],
        metadatas=[{"doc_id": doc_id, "filename": filename, "chunk_index": i} for i in range(len(chunks))]
    )
    return len(chunks)
