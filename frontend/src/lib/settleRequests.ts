type RequestFactoryMap = Record<string, () => Promise<unknown>>;

type SettledData<T extends RequestFactoryMap> = Partial<{
  [K in keyof T]: Awaited<ReturnType<T[K]>>;
}>;

type SettledErrors<T extends RequestFactoryMap> = Partial<Record<keyof T, string>>;

const getMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Request failed';
};

export async function settleRequests<T extends RequestFactoryMap>(requests: T): Promise<{
  data: SettledData<T>;
  errors: SettledErrors<T>;
}> {
  const entries = Object.entries(requests) as Array<[keyof T, T[keyof T]]>;
  const settled = await Promise.allSettled(entries.map(([, request]) => request()));

  const data: SettledData<T> = {};
  const errors: SettledErrors<T> = {};

  settled.forEach((result, index) => {
    const [key] = entries[index];

    if (result.status === 'fulfilled') {
      data[key] = result.value as SettledData<T>[typeof key];
      return;
    }

    errors[key] = getMessage(result.reason);
  });

  return { data, errors };
}
