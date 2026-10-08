import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifyOrderPaymentSignature, verifySubscriptionPaymentSignature, verifyWebhookSignature } from './razorpay.client';

const hmac = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

describe('webhook signature', () => {
  const secret = 'whsec_test';
  const body = Buffer.from('{"event":"subscription.charged","payload":{}}');

  it('accepts the HMAC of the raw body', () => {
    expect(verifyWebhookSignature(body, hmac(secret, body.toString()), secret)).toBe(true);
  });

  it('rejects a tampered body, a wrong secret, a missing signature and an unset secret', () => {
    const good = hmac(secret, body.toString());
    expect(verifyWebhookSignature(Buffer.from('{"event":"x"}'), good, secret)).toBe(false);
    expect(verifyWebhookSignature(body, hmac('other', body.toString()), secret)).toBe(false);
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
    expect(verifyWebhookSignature(body, good, '')).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    expect(verifyWebhookSignature(body, 'abc', secret)).toBe(false);
  });
});

describe('checkout signatures', () => {
  const secret = 'key_secret';

  it('verifies subscription payments as payment|subscription', () => {
    const sig = hmac(secret, 'pay_1|sub_1');
    expect(verifySubscriptionPaymentSignature('pay_1', 'sub_1', sig, secret)).toBe(true);
    // The order of the two ids is part of the contract.
    expect(verifySubscriptionPaymentSignature('sub_1', 'pay_1', sig, secret)).toBe(false);
    expect(verifySubscriptionPaymentSignature('pay_1', 'sub_2', sig, secret)).toBe(false);
  });

  it('verifies order payments as order|payment', () => {
    const sig = hmac(secret, 'order_1|pay_1');
    expect(verifyOrderPaymentSignature('order_1', 'pay_1', sig, secret)).toBe(true);
    expect(verifyOrderPaymentSignature('pay_1', 'order_1', sig, secret)).toBe(false);
  });

  it('fails closed on empty inputs', () => {
    expect(verifySubscriptionPaymentSignature('', 'sub_1', 'x', secret)).toBe(false);
    expect(verifyOrderPaymentSignature('order_1', 'pay_1', undefined, secret)).toBe(false);
    expect(verifyOrderPaymentSignature('order_1', 'pay_1', hmac('', 'order_1|pay_1'), '')).toBe(false);
  });
});
