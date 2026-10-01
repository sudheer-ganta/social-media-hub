import { env } from '../src/config/env';
import jwt from 'jsonwebtoken';

async function testSingle() {
  const userId = 'd15e131b-34da-43d2-bfaf-a9ba332506fd';
  const token = jwt.sign(
    { sub: userId, email: 'testxyz@gmail.com', role: 'authenticated' },
    env.JWT_SECRET || 'secret'
  );

  const payload = {
    prompt: 'Premium single-origin Ethiopian coffee beans roasted to perfection',
    contextType: 'personal',
    platforms: ['instagram'],
    aspectRatio: '4:5',
    goal: 'conversions',
    funnelStage: 'BOFU',
    selectedStyleId: 'editorial',
    brandVoice: {
      name: 'FlowPost Studios',
      description: 'Artisanal roasters creating modern sensory experiences',
      tone: 'sophisticated, warm, editorial',
    },
  };

  console.log('Sending real POST to http://localhost:5000/api/ai/creative/generate ...');
  const start = Date.now();
  const res = await fetch('http://localhost:5000/api/ai/creative/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Creative-Request-Id': `req-live-test-${Date.now()}`,
    },
    body: JSON.stringify(payload),
  });

  const duration = Date.now() - start;
  console.log('Status:', res.status, res.statusText, `in ${duration}ms`);
  const data = await res.json();
  console.log('Full Response Data:', JSON.stringify(data, null, 2));
}

testSingle().catch(console.error);
