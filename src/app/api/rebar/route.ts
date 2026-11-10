import { validateBatchingApiKey } from '@/lib/batching/auth'
import { jsonWithCors, handleOptions } from '@/lib/batching/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return handleOptions()
}

/**
 * GET /api/rebar
 * 
 * Rebar API Documentation and Endpoints Reference.
 */
export async function GET(req: Request) {
  const auth = validateBatchingApiKey(req)
  const baseUrl = new URL(req.url).origin

  return jsonWithCors({
    service: 'RebarPro Rebar Inventory & Usage API',
    version: '1.0.0',
    description: 'REST API for rebar transactions (usage, incoming), stock balances, physical stock takes, and sizes.',
    authentication: {
      type: 'API Key',
      methods: [
        'Header: "x-api-key: <YOUR_API_KEY>"',
        'Header: "Authorization: Bearer <YOUR_API_KEY>"',
        'Query Parameter: "?api_key=<YOUR_API_KEY>"',
      ],
      current_status: auth.authorized ? 'Authenticated' : 'Unauthenticated',
    },
    cors_enabled: true,
    endpoints: [
      {
        path: '/api/rebar/usage',
        methods: ['GET', 'POST', 'OPTIONS'],
        description: 'Query or post rebar usage and incoming delivery transactions.',
        query_parameters: {
          from: 'Start date (YYYY-MM-DD), e.g. 2026-11-01',
          to: 'End date (YYYY-MM-DD), e.g. 2026-11-10',
          size: 'Filter by rebar size (e.g. "H10", "H13", "H16", "H20", "H25", "H28", "H32", "H40", "H8")',
          supplier: 'Filter by supplier (e.g. "CES", "KOMT")',
          type: '"usage" (default) | "incoming" | "transfer" | "all"',
          format: '"json" (default) | "csv"',
          page: 'Page number (default: 1)',
          limit: 'Items per page (default: 100, max: 1000)',
        },
        sample_post_body: [
          {
            date: '2026-11-10',
            size: 'H16',
            quantity: 2500,
            type: 'usage',
            supplier: 'CES',
            do_number: 'DO-2611-001',
            notes: 'Production Bay 3'
          }
        ]
      },
      {
        path: '/api/rebar/stock',
        methods: ['GET', 'OPTIONS'],
        description: 'Get current theoretical balances, physical counts, variance, and days of cover per rebar size.',
        query_parameters: {
          supplier: 'Optional filter by supplier (e.g. "CES", "KOMT")',
        }
      },
      {
        path: '/api/rebar/sizes',
        methods: ['GET', 'OPTIONS'],
        description: 'List all rebar sizes with their standard units and target daily usage.',
      }
    ],
    examples: {
      curl_get_usage: `curl -H "x-api-key: <API_KEY>" "${baseUrl}/api/rebar/usage?size=H16&from=2026-11-01&to=2026-11-10"`,
      curl_get_stock: `curl -H "x-api-key: <API_KEY>" "${baseUrl}/api/rebar/stock"`,
      curl_post_usage: `curl -X POST -H "Content-Type: application/json" -H "x-api-key: <API_KEY>" -d '{"size":"H16","quantity":1500,"date":"2026-11-10","type":"usage"}' "${baseUrl}/api/rebar/usage"`,
      javascript_fetch: `
const res = await fetch('${baseUrl}/api/rebar/usage?size=H16', {
  headers: { 'x-api-key': 'YOUR_API_KEY' }
});
const data = await res.json();
console.log(data);
`
    }
  })
}
