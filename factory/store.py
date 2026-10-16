"""Where finished pairs and the catalog live. Local folder for tests, Cloudflare R2 (S3 API) in production."""
import os, json

class LocalStore:
    def __init__(self, root): self.root = root; os.makedirs(root, exist_ok=True)
    def put(self, key, data, ctype):
        p = os.path.join(self.root, key); os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "wb").write(data)
    def get(self, key):
        p = os.path.join(self.root, key)
        return open(p, "rb").read() if os.path.exists(p) else None

class R2Store:
    def __init__(self, account_id, bucket, key_id, secret):
        import boto3
        self.b = bucket
        self.s3 = boto3.client("s3", endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
                               aws_access_key_id=key_id, aws_secret_access_key=secret, region_name="auto")
    def put(self, key, data, ctype):
        cache = "public, max-age=300" if key.startswith("catalog/") else "public, max-age=31536000, immutable"
        self.s3.put_object(Bucket=self.b, Key=key, Body=data, ContentType=ctype, CacheControl=cache)
    def get(self, key):
        try: return self.s3.get_object(Bucket=self.b, Key=key)["Body"].read()
        except self.s3.exceptions.NoSuchKey: return None

class Catalog:
    """catalog/index.json lists shards; each shard holds up to SHARD pairs. New pairs go into the newest shard."""
    SHARD = 500
    def __init__(self, store):
        self.store = store
        raw = store.get("catalog/index.json")
        self.index = json.loads(raw) if raw else {"version": 1, "total": 0, "levels": [0, 0, 0], "shards": []}
        self.dirty = {}
    def _shard(self, name):
        if name not in self.dirty:
            raw = self.store.get(f"catalog/{name}")
            self.dirty[name] = json.loads(raw) if raw else []
        return self.dirty[name]
    def add(self, entry):
        sh = self.index["shards"]
        if not sh or sh[-1]["count"] >= self.SHARD:
            sh.append({"name": f"shard-{len(sh) + 1:05d}.json", "count": 0, "levels": [0, 0, 0]})
        cur = sh[-1]; self._shard(cur["name"]).append(entry)
        cur["count"] += 1; cur["levels"][entry["l"]] += 1
        self.index["total"] += 1; self.index["levels"][entry["l"]] += 1
    def flush(self):
        import time
        for name, data in self.dirty.items():
            self.store.put(f"catalog/{name}", json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode(), "application/json")
        self.index["updated"] = int(time.time())
        self.store.put("catalog/index.json", json.dumps(self.index, separators=(",", ":")).encode(), "application/json")
