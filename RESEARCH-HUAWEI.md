# بحث دمج Huawei Config API

## القرار

دعم فك ملفات إعدادات Huawei داخل API بدأ بالموديلين `DG8045` و`HG633` لأن المصدر البرمجي المنشور يحدد خوارزمية وRSA modulus منفصلين لهذين الموديلين.

## الخوارزمية المعتمدة

- AES-256-CBC لفك الحمولة.
- zlib لفك الضغط بعد AES.
- كتلة RSA بطول 128 بايت للتحقق من MD5.
- فك قيم كلمات المرور التي تبدأ بـ `AQAAAB` داخل XML.
- DG8045 يستخرج IV من موضع الملف، بينما HG633 يستخدم IV ثابتاً.

## المصدر الأولي

- [المشروع المرجعي وREADME](https://github.com/minanagehsalalma/huawei-dg8045-hg630-hg633-Config-file-decryption-and-password-decode)
- [كود huawei_tool.py](https://raw.githubusercontent.com/minanagehsalalma/huawei-dg8045-hg630-hg633-Config-file-decryption-and-password-decode/main/huawei_tool.py)

## القيود

- لا يعني اسم الموديل أن كل إصدارات Firmware متوافقة؛ قد تتغير المفاتيح أو التخطيط.
- ملف Firmware ليس بالضرورة نسخة إعدادات قابلة للفك.
- لا توجد خوارزمية عامة لجميع أجهزة Huawei.
- اختيار Huawei في API لا يقبل إلا `dg8045` أو `hg633` حالياً.

## أثر القرار

أضيفت الدالة `decode_huawei_bytes` لمعالجة الملف داخل الذاكرة، دون إنشاء ملفات مؤقتة. أضيفت نقطتا API:

- `POST /api/v1/decode` مع `router_type=huawei` و`huawei_model`.
- `POST /api/v1/huawei/decode` كاختصار مباشر.

يجب اختبار كل موديل جديد بعينة إعدادات حقيقية من نفس إصدار Firmware قبل إضافته إلى القائمة.
