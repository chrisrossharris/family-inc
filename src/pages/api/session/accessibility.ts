import type { APIRoute } from 'astro';
import { z } from 'zod';

const FONT_WEIGHT_COOKIE = 'fi_font_weight';

const schema = z.object({
  fontWeight: z.enum(['normal', 'bold']),
  returnTo: z.string().optional().default('/')
});

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  cookies.set(FONT_WEIGHT_COOKIE, parsed.data.fontWeight, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365
  });

  return redirect(parsed.data.returnTo, 303);
};

