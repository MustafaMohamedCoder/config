# ملاحظات بحث هندسي

## القرار
تم اعتماد نسخة محلية من `mkst/zte-config-utility` بدلاً من استدعاء CLI خارجي، لأن المستودع يعرّف واجهات Python واضحة في `zcu.compression` و`zcu.xcryptors` و`zcu.known_keys`. هذا يقلل عمليات الملفات المؤقتة في Render ويسمح بإعادة استخدام metadata داخل طلب الويب.

## الأدلة
- README المستودع يذكر أن الأداة تختبر Python 3.7+ وأنها لا تضمن كل ملفات `config.bin`، وأن نوع الحمولة 2 يعتمد على AES-128 ECB، والنوعين 3 و4 على AES-256 CBC.
- `zcu/known_keys.py` يعرّف المفاتيح الثابتة، مولدات Signature وSerial وTagParams، لذلك يقدّم التطبيق هذه الخيارات بدلاً من الادعاء بوجود مفتاح افتراضي عالمي.
- `zcu/xcryptors.py` يستورد AES من namespace `Cryptodome` في النسخة الأصلية؛ تم تكييف النسخة المضمنة إلى `Crypto.Cipher` لتطابق حزمة `pycryptodome` المطلوبة في Render.

## القيود
قد تفشل ملفات Type 4 أو Type 5/6 التي تحتاج مفاتيح أو معلمات غير موجودة في المصدر المرجعي. التطبيق يرفض الحمولة غير المدعومة برسالة واضحة، ولا يسجل مفاتيح المستخدم أو محتوى XML.

## المصادر
- https://github.com/mkst/zte-config-utility/blob/master/README.md
- https://github.com/mkst/zte-config-utility/blob/master/zcu/known_keys.py
- https://github.com/mkst/zte-config-utility/blob/master/zcu/xcryptors.py
- https://www.pycryptodome.org/
- https://render.com/docs/deploy-flask
