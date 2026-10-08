# ZTE Config Studio

تطبيق ويب Flask لتحويل ملفات إعدادات راوترات ZTE بين `config.bin` و`config.xml`. يعتمد على خوارزميات [mkst/zte-config-utility](https://github.com/mkst/zte-config-utility) المضمنة داخل المشروع، وعلى `pycryptodome` لتشفير AES.

> استخدم الأداة على نسخ الإعدادات التي تملكها أو لديك تصريح بإدارتها. لا يضمن المشروع نجاح كل موديلات ZTE؛ فالمكتبة المرجعية نفسها تذكر أن الدعم مبني على ملفات اختبار محددة.

## المزايا

الواجهة عربية RTL ومتجاوبة، وتوفر رفعاً بالسحب والإفلات، ومحرر XML داخل المتصفح، وتنزيلاً منفصلاً لـ XML، وإعادة تشفير مباشرة إلى `config.bin`. يوجد أيضاً قسم مستقل **تشفير ملف XML** لرفع ملف `config.xml` جاهز وتحديد نوع الحمولة والمفتاح ثم تنزيل `config.bin` مباشرة، من دون المرور بمرحلة فك ملف BIN. يدعم التطبيق Type 0 بدون تشفير، وType 2 بالمفاتيح الثابتة، وType 3 بمفتاح الموديل، وType 4 بالمفاتيح المشتقة من Signature أو Serial أو TagParams. وضع Default يحاول اكتشاف المفتاح من Signature ثم يجرب المفاتيح الثابتة المعروفة.

## هيكل المشروع

```text
zte-config-web/
├── app.py                 # Flask API والعمليات الثنائية
├── zcu/                   # نسخة محلية من مكتبة zte-config-utility
├── templates/index.html   # الواجهة العربية ومحرر CodeMirror
├── static/app.js          # التفاعل وطلبات API
├── static/styles.css      # التصميم المتجاوب
├── tests/test_app.py      # اختبارات أساسية
├── requirements.txt
├── Procfile
└── runtime.txt
```

## تشغيل محلي

```bash
git clone https://github.com/MustafaMohamedCoder/config.git
cd config
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

افتح `http://127.0.0.1:5000`. ولتشغيل Gunicorn محلياً:

```bash
gunicorn --workers 2 --threads 4 --timeout 120 app:app
```

## طريقة الاستخدام

1. ارفع ملف `config.bin` الأصلي، وليس ملفاً مشفراً Base64.
2. ابدأ بوضع **Default**. إذا فشل، اختر مفتاح الموديل أو المفتاح الثابت المناسب.
3. ملفات Type 4 قد تحتاج `Signature` أو `Serial` أو `MAC` و`Long Password` كما يظهر في بيانات TagParams.
4. بعد نجاح الفك عدّل XML في المحرر. زر **تنزيل XML** يحفظ النسخة النصية، وزر **تعديل وتشفير مباشر** يعيد بناء `config.bin` بنفس بيانات الحمولة التي اكتشفها التطبيق.
5. احتفظ دائماً بنسخة احتياطية من الملف الأصلي؛ اختلاف نوع الحمولة أو المفتاح قد يجعل الراوتر يرفض النسخة الجديدة.

## رفع المشروع إلى GitHub

إذا كان المستودع فارغاً أو مخصصاً لهذا التطبيق:

```bash
git init
git add .
git commit -m "Build ZTE config Flask web utility"
git branch -M main
git remote add origin https://github.com/MustafaMohamedCoder/config.git
git push -u origin main
```

إذا كان المستودع يحتوي ملفات أخرى، أنشئ فرعاً منفصلاً أولاً ثم افتح Pull Request:

```bash
git checkout -b feature/zte-config-web
git add . && git commit -m "Add ZTE config web application"
git push -u origin feature/zte-config-web
```

لا تضع مفاتيح أو ملفات إعدادات حقيقية داخل Git؛ أضفها إلى `.gitignore` أو عالجها محلياً.

## النشر المجاني على Render بدون بطاقة

1. أنشئ حساباً في [Render](https://render.com) بالبريد أو GitHub. عادةً يمكن إنشاء Web Service ضمن الخطة المجانية دون إدخال بطاقة، لكن شروط المنصة قد تتغير حسب المنطقة والحساب.
2. من لوحة Render اختر **New → Web Service** ثم اربط مستودع GitHub `MustafaMohamedCoder/config`.
3. الإعدادات المقترحة: Runtime = Python، Build Command = `pip install -r requirements.txt`، Start Command = `gunicorn --workers 2 --threads 4 --timeout 120 app:app`.
4. اختر **Free** ثم أنشئ الخدمة. لا توجد قاعدة بيانات أو متغيرات سرية مطلوبة لهذا التطبيق.
5. بعد اكتمال البناء افتح رابط `onrender.com` واختبر الصفحة ورفع ملف اختبار صغير.

### وضع النوم في الخطة المجانية

الخدمة المجانية قد تدخل في Sleep Mode بعد فترة من عدم النشاط. أول طلب بعدها يكون أبطأ لأنه ينتظر إعادة تشغيل الحاوية، وهذا طبيعي وليس عطلاً. لا تعتمد على الخدمة المجانية لعمليات طويلة أو توافر دائم، ولا تستخدم خدمات ping اصطناعية إذا كانت تخالف شروط Render. قلل حجم الملفات، وارفع الملفات عند الحاجة فقط، واحتفظ بالنسخة الأصلية محلياً. تتم المعالجة في الذاكرة ولا يكتب التطبيق ملفات المستخدم على قرص Render.

## الأمان والحدود

الحد الأقصى للرفع 16MB. يتم التحقق من XML قبل تنزيله أو تشفيره، وتُعاد رسائل مبسطة بدلاً من تفاصيل الاستثناءات. لا يوجد تسجيل دخول في النسخة الحالية؛ إذا نشرت الرابط للعامة فاعتبره أداة شخصية مؤقتة، وأضف مصادقة وHTTPS وسياسة حذف/خصوصية قبل استخدامها كخدمة مشتركة.

## المصادر

- [المستودع المرجعي zte-config-utility](https://github.com/mkst/zte-config-utility)
- [توثيق PyCryptodome](https://www.pycryptodome.org/)
- [Render Python Web Services](https://render.com/docs/deploy-flask)
