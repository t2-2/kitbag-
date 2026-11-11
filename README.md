# KITBAG+ | קיטבג+
Frontend: `index.html` (קובץ אחד, Vercel). Backend: `convex/` (פריסה דרך `.github/workflows/deploy.yml`).

## הגדרה
1. GitHub secret: `CONVEX_DEPLOY_KEY` (Production). אופציונלי: `KITBAG_BOOTSTRAP_USER` / `KITBAG_BOOTSTRAP_PASSWORD` למפקד הראשון.
2. הדבק את כתובת `.convex.cloud` ב-`KITBAG_CONFIG` בראש `index.html`.
3. כניסה ראשונה כמפקד, ואז לשונית מלאי ← "טען מלאי התחלתי".

## כניסת שוחר: שם משתמש + OTP במייל
- אין תעודות זהות. כשמפקד מוסיף שוחר (שם, משפחה, מייל, שכבה) נוצר לו שם משתמש בפורמט **2 אותיות + 128 + 4 ספרות** (למשל `kx1284821`) והוא נשלח למייל שלו בעיצוב KITBAG+.
- בכל כניסה השוחר כותב את שם המשתמש, מקבל קוד בן 6 ספרות למייל הרשום (תקף 10 דקות, 5 ניסיונות, 5 שליחות לשעה) ומזין אותו.
- בייבוא קובץ נוצרים שמות משתמש לכולם, ואז "שליחת שמות משתמש" שולח את המיילים (כפתור גם בלשונית "עוד"). שוחרים ותיקים בלי שם משתמש מקבלים אחד בשליחה הראשונה.
- Convex Environment Variables: `APP_URL` = כתובת האתר ב-Vercel (בשביל הלוגו והכפתור במייל; הלוגו הוא `logo.png` בשורש האתר).

### שליחת המייל: Convex ← Gmail (בלי שרת נוסף)
ב-Convex Dashboard ← Environment Variables:
- `GMAIL_USER` = כתובת ה-Gmail ששולחת (למשל `kitbag.system@gmail.com`)
- `GMAIL_APP_PASSWORD` = סיסמת אפליקציה בת 16 תווים (Google Account ← Security ← 2-Step Verification ← App passwords; חובה להפעיל אימות דו-שלבי)
- `APP_URL` = כתובת האתר ב-Vercel (לוגו וכפתור במייל)
המגבלה נקבעת ע"י גוגל לשליחה ביום (לבדוק במסמכי גוגל; בחשבון Gmail רגיל היא נמוכה יחסית ל-Workspace).
חלופות בלי שינוי קוד: `SMTP_HOST/PORT/USER/PASS/MAIL_FROM` (Brevo, SES...) או `RESEND_API_KEY`.

## אבטחה
כל Query/Mutation בודקת סשן בשרת (`lib/auth.ts`). הטוקן בזיכרון הדפדפן בלבד, ללא LocalStorage/SessionStorage (רענון דף = כניסה מחדש).
סיסמאות: scrypt. קודי שוחר: 10 תווים אקראיים, נשמרים כ-hash, 30 יום, מוגבל ל-5 ניסיונות ב-15 דקות. חתימות נקראות רק דרך פונקציות מוגנות.

## גיבוי ושחזור
Convex Dashboard ← Settings ← Backups (גיבוי ידני ואוטומטי + שחזור). בנוסף, לשונית "עוד" ← ייצוא שוחרים ומלאי ל-CSV.
