# API فك ملفات التكوين

أضاف التطبيق نقطة API مستقلة لفك ملفات `config.bin` تلقائياً إلى XML.

## المسار

```text
POST /api/v1/decode
```

الموقع المنشور:

```text
https://mumost.pythonanywhere.com/api/v1/decode
```

## الطريقة الأولى: رفع Multipart

```bash
curl -X POST \
  -F "file=@config.bin" \
  https://mumost.pythonanywhere.com/api/v1/decode
```

يمكن إرسال خيارات المفتاح مع الملف عند الحاجة:

```bash
curl -X POST \
  -F "file=@config.bin" \
  -F "key_mode=default" \
  -F "signature=ZXHN H108N" \
  https://mumost.pythonanywhere.com/api/v1/decode
```

## الطريقة الثانية: JSON وBase64

حوّل الملف إلى Base64 ثم أرسل JSON:

```bash
python3 - <<'PY'
import base64, json
from pathlib import Path

payload = {
    "filename": "config.bin",
    "file_base64": base64.b64encode(Path("config.bin").read_bytes()).decode("ascii"),
    "key_mode": "default",
}
Path("request.json").write_text(json.dumps(payload), encoding="utf-8")
PY

curl -X POST \
  -H "Content-Type: application/json" \
  --data-binary @request.json \
  https://mumost.pythonanywhere.com/api/v1/decode
```

## الاستجابة الناجحة

```json
{
  "ok": true,
  "filename": "config.bin",
  "xml": "<DB>...</DB>",
  "xml_base64": "...",