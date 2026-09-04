import { cookies } from 'next/headers';
import { customFetch } from '@gitroom/helpers/utils/custom.fetch.func';

export const internalFetch = async (url: string, options: RequestInit = {}) => {
  const cookieStore = await cookies();
  const auth = cookieStore?.get('auth')?.value!;
  const showorg = cookieStore?.get('showorg')?.value!;
  const org = cookieStore?.get('org')?.value;
  const fetchFn = customFetch(
    { baseUrl: process.env.BACKEND_INTERNAL_URL! },
    auth,
    showorg
  );
  if (!org) {
    return fetchFn(url, options);
  }

  const baseHeaders: Record<string, string> = {};
  const incoming = options.headers;
  if (incoming instanceof Headers) {
    incoming.forEach((value, key) => {
      baseHeaders[key] = value;
    });
  } else if (Array.isArray(incoming)) {
    for (const [key, value] of incoming) {
      baseHeaders[key] = value;
    }
  } else if (incoming) {
    Object.assign(baseHeaders, incoming);
  }

  const existingCookie = baseHeaders.cookie || baseHeaders.Cookie || '';
  return fetchFn(url, {
    ...options,
    headers: {
      ...baseHeaders,
      cookie: [existingCookie, `org=${org}`].filter(Boolean).join('; '),
    },
  });
};
