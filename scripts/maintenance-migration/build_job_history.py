"""
Transforms the "Form Responses 2" tab of the user's Google Sheet
(https://docs.google.com/spreadsheets/d/1QKfeVdKjDd_cps8o71EAqiFU08bwbKc_tdQsqIxSYgY)
into rows ready to insert into maintenance_work_requests, for the new Job
History page.

Reads scripts/maintenance-migration/form_responses2.csv (already fetched)
and equipment_registry.json (already fetched from the live DB), matches
each row's "Equipment List" against the real equipment registry using the
same token-overlap approach as the original INVENTORY.xlsx migration, and
writes job_history_data.json for upload_job_history.mjs to insert.

Equipment matching is only attempted when "Equipment List" names exactly
one machine (no comma) — a comma-separated list (common for routine
multi-machine sweeps) can't map to this table's single equipment_id column,
so those rows keep equipment_id null but the full list is preserved in the
issue description instead of being silently dropped.
"""
import csv
import json
import re
from datetime import datetime

FOLDER = 'C:/Users/hp/Documents/RebarPro/scripts/maintenance-migration'


def norm(s):
    if s is None:
        return ''
    return re.sub(r'\s+', ' ', str(s)).strip()


def tokens(s):
    s = norm(s).lower()
    s = s.replace('multicrane', 'multi').replace('straddle crane', 'straddle')
    toks = set(re.findall(r'\d+\.?\d*ton|\d+hp|no\.?\s?\d+|line\s?\d+|yard\s?[a-z]|n\d+|[a-z]+|\d+', s))
    # Also add every bare digit substring found anywhere, so "No.2" (which
    # tokenizes as the single compound token "no.2") still shares a common
    # digit signal with a differently-worded source like "Plant 2" (which
    # only has the bare digit "2") — without this, "Batching Plant 2" and
    # "Batching Machine No.1"/"No.2" were indistinguishable except by which
    # one happened to be scanned first, since neither representation's
    # digit token matched the other's.
    toks |= set(re.findall(r'\d+', s))
    stop = {'the', 'of', 'a', 'and', 'no', 'na', 'area', 'plo', 'plo68', 'plo79'}
    return {t for t in toks if t not in stop and (len(t) > 1 or t.isdigit())}


def non_digit(tok_set):
    return {t for t in tok_set if not t.isdigit()}


def has_real_overlap(a, b):
    # A single shared generic word ("water" matching both "Water pipe" and
    # "Water Jet 200bar 1") isn't enough on its own — that produced a real
    # false positive in review. Require either two independent non-digit
    # words in common, or one non-digit word plus a matching digit (the
    # digit is what disambiguates e.g. "Grinder 4"" from other grinders).
    non_digit_overlap = non_digit(a) & non_digit(b)
    digit_overlap = (a & b) - non_digit_overlap
    return len(non_digit_overlap) >= 2 or (len(non_digit_overlap) >= 1 and len(digit_overlap) >= 1)


def score(a, b):
    return len(a & b) if a and b else 0


with open(f'{FOLDER}/equipment_registry.json', encoding='utf-8') as f:
    registry = json.load(f)
for e in registry:
    e['_name_tok'] = tokens(e['name'])
    e['_cat_tok'] = tokens(e['category']) if norm(e['category']).lower() not in ('tool', 'tools', 'equipment', 'batching plant') else set()


def match_equipment(name):
    # Requires real overlap against the equipment's own NAME tokens
    # specifically (not the category) — matching on category alone let
    # "Batching Plant 2" wrongly match "Batching Machine No.1" purely
    # because both share the generic "Batching Plant" category (there are
    # only 2 batching machines and no digit in the category to
    # disambiguate). Category tokens still count toward the score once a
    # real name match exists, as a tiebreaker only.
    n_tok = tokens(name)
    best, best_score = None, 0
    for e in registry:
        if not has_real_overlap(n_tok, e['_name_tok']):
            continue
        s = score(n_tok, e['_name_tok']) + score(n_tok, e['_cat_tok'])
        if s > best_score:
            best, best_score = e, s
    return best['id'] if best and best_score >= 1 else None


def extract_drive_id(evidence_text):
    """The sheet's Evidence column holds a Drive link (usually
    'open?id=XXX', sometimes '/file/d/XXX/view'), occasionally several
    comma-separated links, or just a bare filename with no URL at all.
    Our schema only stores one photo per request, so only the first
    resolvable link is used."""
    s = norm(evidence_text)
    if not s:
        return None
    m = re.search(r'[?&]id=([\w-]{15,})', s)
    if m:
        return m.group(1)
    m = re.search(r'/file/d/([\w-]{15,})', s)
    if m:
        return m.group(1)
    return None


NOISE_VALUES = {'', 'na', 'n/a', '-', 'nil', 'none'}


def meaningful(s):
    return norm(s) and norm(s).lower() not in NOISE_VALUES


def parse_dt(s):
    s = norm(s)
    if not s:
        return None
    for fmt in ('%m/%d/%Y %H:%M:%S', '%m/%d/%Y %H:%M', '%m/%d/%Y'):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


STATUS_MAP = {'done': 'approved', 'pending': 'assigned', 'cannot repair': 'cancelled'}

with open(f'{FOLDER}/form_responses2.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(f'Read {len(rows)} source rows')

out = []
matched = 0
skipped_no_issue = 0
for r in rows:
    task = norm(r.get('Task or issue'))
    if not task:
        skipped_no_issue += 1
        continue

    equip_list_raw = norm(r.get('Equipment List'))
    category = norm(r.get('Category'))
    is_single = equip_list_raw and ',' not in equip_list_raw
    equipment_id = match_equipment(equip_list_raw) if is_single else None
    if equipment_id:
        matched += 1

    diagnose = norm(r.get('Diagnose'))
    remedy = norm(r.get('Remedy'))

    # Always keep the sheet's own category/equipment text visible, even when
    # equipment_id is confidently matched — a wrong auto-match would
    # otherwise silently hide the real source text with no way to check it.
    desc_lines = []
    tag = ' / '.join(x for x in [category, equip_list_raw] if x)
    desc_lines.append(f'[{tag}] {task}' if tag else task)
    if meaningful(diagnose):
        desc_lines.append(f'Diagnose: {diagnose}')
    if meaningful(remedy):
        desc_lines.append(f'Remedy: {remedy}')
    issue_description = '\n'.join(desc_lines)

    start = parse_dt(r.get('Date & time start'))
    end = parse_dt(r.get('Date & time end'))
    status_raw = norm(r.get('Job Status')).lower()
    status = STATUS_MAP.get(status_raw, 'approved')  # blank/unrecognized -> treat as done, matches the overwhelming pattern (7458/7465 = "Done")

    requester = norm(r.get('Person In-charge')) or 'Unknown'
    assigned_to = norm(r.get('Repaired By;')) or None
    verified_by = norm(r.get('Verified by ')) or None
    location = norm(r.get('Location')) or None

    row = {
        'requester_name': requester,
        'location': location,
        'equipment_id': equipment_id,
        'issue_description': issue_description,
        'status': status,
        'created_at': (start or end).isoformat() if (start or end) else None,
        'resolution_photo_drive_id': extract_drive_id(r.get('Evidence (photo & job report)')),
    }
    if status in ('approved', 'cancelled'):
        row['assigned_to'] = assigned_to
        row['assigned_at'] = start.isoformat() if start else None
        row['accepted_at'] = start.isoformat() if start else None
    if status == 'approved':
        row['completed_at'] = end.isoformat() if end else (start.isoformat() if start else None)
        row['approved_by'] = verified_by
        row['approved_at'] = end.isoformat() if end else (start.isoformat() if start else None)
    elif status == 'assigned':
        row['assigned_to'] = assigned_to
        row['assigned_at'] = start.isoformat() if start else None

    out.append(row)

print(f'Skipped {skipped_no_issue} rows with no Task/issue text')
print(f'Equipment matched (single-item rows only): {matched}/{len(out)}')
by_status = {}
for r in out:
    by_status[r['status']] = by_status.get(r['status'], 0) + 1
print('By status:', by_status)

with_photo = sum(1 for r in out if r.get('resolution_photo_drive_id'))
print(f'Rows with a resolvable evidence photo: {with_photo}/{len(out)}')

with open(f'{FOLDER}/job_history_data.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
print(f'Wrote {len(out)} rows to job_history_data.json')
