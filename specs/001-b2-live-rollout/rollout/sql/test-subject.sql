-- T003 / DN-3: locate the existing test subject. READ-ONLY.
-- __EMAIL_MD5__ = md5(lower(TEST_ADMIN_EMAIL)), computed locally from .env.local at run time,
-- so the address itself is never sent, printed, or stored.
SELECT u.id,
       p.role,
       p.is_active,
       (p.role = 'admin' AND p.is_active) AS test_subject_ok
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id
WHERE md5(lower(u.email)) = '__EMAIL_MD5__';
