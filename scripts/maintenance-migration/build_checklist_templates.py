import json

templates = []


def add_template(name, scope, frequency, form_code, sections):
    templates.append({'name': name, 'scope': scope, 'frequency': frequency, 'form_code': form_code, 'sections': sections})


# sections: list of (section_label_or_None, [item descriptions])

add_template('Vacuum Machine - Maintenance & Service Report', 'single_equipment', 'Monthly', 'EM-F07/PT005/REV0', [
    (None, [
        'Machine steel structure (Main body)', 'Rubber strip condition', 'Safety belt',
        'Control Panel, Switch box & Wiring', 'Pendant control', 'Air pressure gauge', 'Motor',
        'Air hose & piping system', 'Oil filter, Air filter', 'Grease - bushes', 'Oiling', 'Battery Condition',
    ]),
])

add_template('Vibrating Table - Maintenance & Service Report', 'single_equipment', 'Monthly', 'EM-F07/PT005/REV0', [
    ('A) Vibrator Structure/Platform', [
        'Cleaning', 'Steel structure condition', 'Vibrator motor', 'Air hose & piping system',
        'Rubber buffers condition (Fire stone Airmount Isolator - W01-358-7589)', 'Hydraulic system',
    ]),
    ('B) Control Panel', [
        'Main body cover, Invertor', 'Panel meter function - switches, current rating, rpm meter etc',
        'Electrical system - wiring, MCB, Contactor etc',
    ]),
])

add_template('Segment Turning Machine - Maintenance & Service Report', 'single_equipment', 'Monthly', 'EM-F07/PT005/REV0', [
    ('A) Main Structure', [
        'Machine structure (Main Body)', 'Limit Switch (type: YS 513RL 6 nos - Korea Made)',
        'Hydraulic Jack System (Cylinder & seal)', 'Hydraulic Jack Hose System',
        'Grease at all turning bush', 'Long travel system',
    ]),
    ('B) Hydraulic Pump', [
        'Motor pump wiring & coupling', 'Solenoid valve component / system', 'Fan & Cooling Coil',
        'Hydraulic hose', 'Pressure gauge', 'Control Panel', 'Hydraulic oil - leakage / change',
    ]),
])

add_template('Batching Plant - Maintenance & Service Report', 'single_equipment', 'Every 3 Months', 'EM-F07/PT005/REV0', [
    ('A) Silo/Admixture/Filter Section', [
        'Check of main structure condition', 'Check all pneumatic valve', 'Check all air cylinder',
        'Check pipe conveyor joint/control valve', 'Air hose/piping system any leakage',
        'Belt tension for all motor', 'Wiring system checking (if any)', 'Vibrator motor',
        'Check all motor', 'Check all motor gear & chain', 'Oiling for rotary blower',
    ]),
    ('B) Weighing Hopper Section (Include Loading Conveyor)', [
        'Check of main structure condition', 'Remove all material piled up underneath the belt',
        'Check all pneumatic valve', 'Check all air cylinder', 'Air hose/piping system any leakage',
        'Belt tension for all motor', 'Check the conveyor belt run & adjust (if necessary)',
        'Feed roller belt condition & oiling', 'Check all motor', 'Check all motor gear & chain',
    ]),
    ('C) Concrete Mixer Section', [
        'Check of main structure condition', 'Check mixer & all cement hopper condition',
        'Check all pneumatic valve/solenoid valve', 'Check all air cylinder',
        'Air hose/piping system any leakage', 'Check all load cell', 'Check all vibrator motor',
        'Check all butterfly valve hopper', 'Check all motor', 'Check all motor gear & chain',
        'Check all air regulator condition', 'Wiring system checking (if any)',
        'Check all pressure gauge condition', 'Check mixer blades condition (wear & tear)',
        'Check gap between blades & mixer wall', 'Grease ball joint of mixer door',
    ]),
    ('D) Chiller (Damfoss) & Water Tank Section', [
        'Check main structure condition', 'Check oil compressor level',
        'Check the chiller piping system any leakage', 'Clean the coil system',
        'Wiring system checking (if any)', 'Check water pump motor',
        'Check water in/out poly pipe. Leakage & condition',
    ]),
])

add_template('Daily Machinery and Equipment Condition Checklist', 'section_list', 'Daily', None, [
    ('Batching Plant 1', [
        'Mixer', 'Silo Conveyor', 'Hopper Conveyor', 'Batching Control Panel', 'Chiller Cooling System',
        'Steel Fibre Dosing Machine', 'PP Fibre Bagfeeder Machine', 'Shovel Machinery',
        'Raw Material Roof Shelter', 'Housekeeping',
    ]),
    ('Production', [
        'Concrete Transfer Hopper', 'Mould Cover Lifter', 'Table Vibrator 1', 'Table Vibrator 2',
        'Table Vibrator Control Panel 1', 'Table Vibrator Control Panel 2', 'Motorized Transfer Mould (Front)',
        'Non-Motorized Transfer Mould (Behind)', 'Vacuum Lifting Machine', 'Indoor Turning Machine',
        'Overhead Crane 6.3T', 'Overhead Crane 20T', 'Clamp Lifter to Curing Pond',
    ]),
    ('Water Curing Pond', [
        'Overhead Crane 6.3T', 'Overhead Crane 32T', 'Clamp Lifter to Repair Area',
        'Outdoor Turning and Transfer Car Machine',
    ]),
    ('Repair & Coating Area', ['Overhead Crane 20T', 'Outdoor Turning Machine', 'Tent Shelter']),
    ('Laboratory', [
        'Table Vibrator for Cube Making', 'Table Vibrator for Cylinder and Beam Making',
        'Fresh Concrete Steel Fibre Remover', 'Inhouse Lab Housekeeping',
    ]),
])

add_template('Transport Daily Checklist', 'single_equipment', 'Daily', None, [
    (None, [
        'Radiator and water tank', 'Engine oil', 'Hydraulic oil', 'Brake oil', 'Tyre nut',
        'Battery water and terminal', 'Belting', 'Grease', 'Operator sign', 'Supervisor sign',
    ]),
])

CRANE_ITEMS = [
    'Long Travel Operation', 'Cross Travel Operation', 'Hoist Operation',
    'Motor & Gearbox Condition', 'Control Panel Operation', 'Wire Rope Condition', 'Rail Track & Pathway',
]
CRANES = [
    'Crane 40Ton Multicrane Line 1', 'Crane 16Ton Toptek Line 1', 'Crane 40Ton Multicrane Line 2',
    'Crane 16Ton Toptek Line 2', 'Crane 40Ton Multicrane Line 3', 'Crane 16Ton Toptek Line 3',
    'Crane 40Ton Multicrane Line 4', 'Crane 16Ton Toptek Line 4', 'Crane 5Ton Multicrane Yard A',
    'Crane 20Ton Multicrane No.1 Yard A', 'Crane 20Ton Multicrane No.2 Yard A', 'Crane 20Ton Toptek No.3 Yard A',
    'Crane 32Ton Demag Storage', 'Crane 6.3Ton Multicrane Pond', 'Crane 5Ton Liftech Fabrication',
    'Crane 5Ton Demag Fabrication', 'Crane 20Ton Demag Casting', 'Crane 6.3Ton Demag Casting',
    'Crane 20Ton VME Green Dot', 'Straddle Crane SC 1', 'Straddle Crane SC 2', 'Straddle Crane SC 3',
    'Crane 5Ton Multicrane Mold Repair',
]
add_template('Crane Inspection Checklist', 'section_list', 'Weekly', None, [(c, CRANE_ITEMS) for c in CRANES])

COMPRESSOR_ITEMS = ['Engine Oil', 'Air-filter', 'Drive-Belt', 'Drain Moisture', 'Pressure Gauge']
COMPRESSORS = [
    'Air Compressor 50Hp', 'Air Compressor 15Hp No.1', 'Air Compressor 7.5Hp',
    'Air Compressor 15HP No.2', 'Air Compressor 15HP No.3', 'Air Compressor 3HP No.1',
]
add_template('Air-Compressor Checklist', 'section_list', 'Weekly', None, [(c, COMPRESSORS[0:0] or COMPRESSOR_ITEMS) for c in COMPRESSORS])

with open('scripts/maintenance-migration/checklist_templates.json', 'w', encoding='utf-8') as f:
    json.dump(templates, f, indent=2, ensure_ascii=False)

total_items = sum(len(items) for t in templates for _, items in t['sections'])
print(f'{len(templates)} templates, {total_items} items total')
for t in templates:
    print(' -', t['name'], sum(len(i) for _, i in t['sections']), 'items,', len(t['sections']), 'sections')
