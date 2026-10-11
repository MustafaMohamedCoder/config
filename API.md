
## Huawei API

يدعم API حالياً ملفات Huawei الخاصة بـ `DG8045` و`HG633` فقط. استخدم المسار المباشر:

```text
POST /api/v1/huawei/decode
```

مثال DG8045:

```bash
curl -X POST \
  -F "file=@config.bin" \
  -F "huawei_model=dg8045" \
  https://mumost.pythonanywhere.com/api/v1/huawei/decode
```

مثال HG633:

```bash
curl -X POST \
  -F "file=@config.bin" \
  -F "huawei_model=hg633" \
  https://mumost.pythonanywhere.com/api/v1/huawei/decode
```

ويمكن استخدام المسار العام مع تحديد النوع:

```bash
curl -X POST \
  -F "file=@config.bin" \
  -F "router_type=huawei" \
  -F "huawei_model=dg8045" \
  https://mumost.pythonanywhere.com/api/v1/decode
```

تعيد الاستجابة `xml` و`xml_base64` و`metadata`، بما في ذلك `signature_verified` واسم الموديل. إذا كان الموديل أو إصدار Firmware مختلفاً فقد تفشل العملية لأن مفاتيح Huawei وتخطيط الملف قد يتغيران بين الإصدارات.
