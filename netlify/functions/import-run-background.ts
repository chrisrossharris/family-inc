interface Payload {
  jobId?: number;
  secret?: string;
}

export const handler = async (event: { body: string | null }) => {
  try {
    const body: Payload = event.body ? JSON.parse(event.body) : {};
    const jobId = Number(body.jobId ?? 0);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid jobId' })
      };
    }

    const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL;
    if (!baseUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing site URL env for callback' })
      };
    }

    const response = await fetch(new URL('/api/import-jobs/run', baseUrl).toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-import-job-secret': process.env.IMPORT_JOB_SECRET || body.secret || ''
      },
      body: JSON.stringify({ jobId })
    });

    return {
      statusCode: response.status,
      body: await response.text()
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(error) })
    };
  }
};
