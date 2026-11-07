import { validateBatchingApiKey } from '@/lib/batching/auth'
import { jsonWithCors, handleOptions } from '@/lib/batching/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return handleOptions()
}

/**
 * GET /api/batching
 * 
 * Overview and documentation for the Batching Plant Usage External API.
 */
export async function GET(req: Request) {
  const auth = validateBatchingApiKey(req)

  const baseUrl = new URL(req.url).origin

  return jsonWithCors({
    service: 'RebarPro Batching Plant API',
    version: '1.0.0',
    description: 'REST API for batching plant actual and theoretical material usage tracking by date and time.',
    authentication: {
      type: 'API Key',
      methods: [
        'Header: "x-api-key: <YOUR_API_KEY>"',
        'Header: "Authorization: Bearer <YOUR_API_KEY>"',
        'Query Parameter: "?api_key=<YOUR_API_KEY>"'
      ],
      current_status: auth.authorized ? 'Authenticated' : 'Unauthenticated',
    },
    cors_enabled: true,
    endpoints: [
      {
        path: '/api/batching/usage',
        methods: ['GET', 'POST', 'OPTIONS'],
        description: 'Query or ingest batching plant actual usage and theoretical usage records.',
        query_parameters: {
          from: 'Start date/time (ISO 8601 or YYYY-MM-DD), e.g. 2026-11-01 or 2026-11-01T08:00:00Z',
          to: 'End date/time (ISO 8601 or YYYY-MM-DD), e.g. 2026-11-07 or 2026-11-07T18:00:00Z',
          material: 'Filter by material name (e.g. "OPC", "GGBS", "Fly Ash")',
          plant: 'Filter by batching plant name (e.g. "PLO 68", "PLO 79")',
          mix_code: 'Filter by concrete mix/recipe code (e.g. "Grade 40")',
          batch_ticket_no: 'Filter by batching ticket number',
          group_by: '"none" (default raw entries) | "material" | "plant" | "date"',
          format: '"json" (default) | "csv" (downloads spreadsheet)',
          page: 'Pagination page number (default: 1)',
          limit: 'Items per page (default: 100, max: 1000)',
          source: '"auto" (default) | "batch" | "daily"',
        },
        sample_post_body: [
          {
            plant_name: 'PLO 68',
            material_name: 'OPC',
            date_time: '2026-11-07T09:30:00Z',
            actual_usage: 365.2,
            theoretical_usage: 360.0,
            unit: 'kg',
            mix_code: 'G40',
            batch_ticket_no: 'BT-2026-0012',
            volume_m3: 1.0,
            operator: 'Batcher 1',
            remarks: 'Pour 3'
          }
        ]
      },
      {
        path: '/api/batching/materials',
        methods: ['GET', 'OPTIONS'],
        description: 'Get list of active batching plants and materials with nominal design requirements.'
      }
    ],
    examples: {
      curl_get: `curl -H "x-api-key: <API_KEY>" "${baseUrl}/api/batching/usage?material=OPC&from=2026-11-01&to=2026-11-07"`,
      curl_post: `curl -X POST -H "Content-Type: application/json" -H "x-api-key: <API_KEY>" -d '{"plant_name":"PLO 68","material_name":"OPC","date_time":"2026-11-07T10:00:00Z","actual_usage":362.5,"theoretical_usage":360.0,"unit":"kg"}' "${baseUrl}/api/batching/usage"`,
      javascript_fetch: `
const res = await fetch('${baseUrl}/api/batching/usage?from=2026-11-01&material=OPC', {
  headers: { 'x-api-key': 'YOUR_API_KEY' }
});
const data = await res.json();
console.log(data);
`
    }
  })
}
