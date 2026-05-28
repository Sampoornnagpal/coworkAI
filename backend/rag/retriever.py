from backend.rag.indexer import get_team_collection, get_embed_model

def retrieve(query: str, team_id: int, k: int = 3) -> list[dict]:
    collection = get_team_collection(team_id)
    if collection.count() == 0:
        return []
    
    model = get_embed_model()
    query_embedding = model.encode([query]).tolist()
    
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=min(k, collection.count()),
        include=["documents", "metadatas", "distances"]
    )
    
    hits = []
    for i in range(len(results["documents"][0])):
        hits.append({
            "text": results["documents"][0][i],
            "filename": results["metadatas"][0][i].get("filename", "unknown"),
            "relevance": round(1 - results["distances"][0][i], 2)
        })
    return hits
