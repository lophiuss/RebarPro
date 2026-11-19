-- Seed Castcore project codes onto existing dler_projects rows where erp_code is currently null.
-- Safe to run repeatedly; does not overwrite manually customized erp_code values.

UPDATE public.dler_projects AS p
SET erp_code = v.code
FROM (
  VALUES
    ('BZ', 'P2502'),
    ('BU', 'P2505'),
    ('KWC61&62', 'P2503'),
    ('J112', 'P2404'),
    ('RR', 'P2406'),
    ('N101', 'P2601'),
    ('CR202', 'P2504'),
    ('CR108', 'P2301'),
    ('CR210', 'P2407'),
    ('CR206', 'P2408'),
    ('N111', 'P2302'),
    ('N113 & N115', 'P2501')
) AS v(name, code)
WHERE p.name = v.name
  AND p.erp_code IS NULL;
