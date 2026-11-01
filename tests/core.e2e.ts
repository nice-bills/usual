import { describe, test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
const say = async (screen: Screen, text: string) => {
  if (!(await screen.getByLabel('Type instead').isVisible())) await screen.getByRole('button', 'Type').tap();
  await screen.getByLabel('Type instead').fill(text);
  await screen.getByRole('button', 'Send').tap();
};

// One mock server for the run: these steps share its ledger and memory, so they run in order.
describe('Usual core flows (mock mode)', { serial: true }, () => {
  test('cold start asks about recurring payees from chain history', async ({ app, screen }) => {
    await app.open('/');
    await expect(screen.getByTestId('balance')).toHaveText('462.50 USDC');
    await expect(screen.getByTestId('asking')).toContainText("50 USDC three times. Who's that?");
  });

  test('naming payees turns them into memories', async ({ screen }) => {
    await say(screen, "That's Mum");
    await expect(screen.getByTestId('say')).toContainText('Got it, Mum. Usually 50 USDC.');
    await expect(screen.getByText(/Who's that\?/)).toHaveCount(1);
    await say(screen, "that's my gym");
    await expect(screen.getByTestId('say')).toContainText('Gym: 35 USDC a month, up from 30.');
    await say(screen, "It's Streamly, a streaming subscription");
    await expect(screen.getByTestId('say')).toContainText('Streamly: 12 USDC a month.');
    await expect(screen.getByTestId('say')).toContainText('credit line');
    await say(screen, 'yes');
    await expect(screen.getByTestId('say')).toContainText('USDC a month on subscriptions');
    await screen.getByRole('button', 'Approve with wallet').tap();
    await expect(screen.getByTestId('status')).toContainText('a month');
  });

  test('send Mum her usual: understood line, then the agent pays inside the family allowance', async ({ screen }) => {
    await say(screen, 'Send Mum her usual');
    await expect(screen.getByTestId('heard')).toContainText('Send Mum her usual');
    await expect(screen.getByTestId('understood')).toContainText('50 USDC');
    await expect(screen.getByTestId('understood')).toContainText('Mum');
    await expect(screen.getByTestId('understood')).toContainText('like the last 3 times');
    await expect(screen.getByTestId('understood')).toContainText('412.50');
    await expect(screen.getByTestId('status')).toContainText('Sent 50 USDC to Mum', { timeout: 10_000 });
    await expect(screen.getByTestId('balance')).toHaveText('412.50 USDC');
  });

  test('the café over the food limit needs the owner, then pays over MPP', async ({ screen }) => {
    await screen.getByRole('button', 'Settings').tap();
    await screen.getByRole('button', 'Café: flat white').tap();
    await expect(screen.getByTestId('say')).toContainText('over your food limit');
    await screen.getByRole('button', 'Approve with wallet').tap();
    await expect(screen.getByTestId('status')).toContainText('Paid the café 4.50.');
  });

  test('refuses to overspend', async ({ screen }) => {
    await say(screen, 'Send Mum 9000');
    await expect(screen.getByTestId('say')).toContainText('more than you have');
  });

  test('unknown people get a question, not a guess', async ({ screen }) => {
    await say(screen, 'send Dad 20');
    await expect(screen.getByTestId('say')).toContainText("Who's Dad?");
  });

  test('a new person is one pasted address away', async ({ screen }) => {
    await say(screen, 'send Alex 5');
    await expect(screen.getByTestId('say')).toContainText('Paste their wallet address');
    await say(screen, '0x' + 'a'.repeat(64));
    await expect(screen.getByTestId('understood')).toContainText('5 USDC');
    await expect(screen.getByTestId('understood')).toContainText('Alex');
    await expect(screen.getByRole('button', 'Approve with wallet')).toBeVisible();
    await say(screen, 'forget Alex');
  });

  test('spending summary spots the price rise and offers to cancel', async ({ screen }) => {
    await say(screen, 'What am I wasting money on?');
    await expect(screen.getByTestId('say')).toContainText('Your gym went from 30 to 35');
    await screen.getByRole('button', 'Cancel Streamly').tap();
    await expect(screen.getByTestId('say')).toContainText('Streamly is marked cancelled');
  });

  test('a wrong name can be taken back', async ({ screen }) => {
    await say(screen, 'forget Gym');
    await expect(screen.getByTestId('say')).toContainText('Forgotten');
  });

  test('cancel stops an automatic payment', async ({ screen }) => {
    await say(screen, 'Send Mum her usual');
    await screen.getByRole('button', 'Cancel payment').tap();
    await expect(screen.getByText('Cancelled. Nothing was sent.')).toBeVisible();
    await expect(screen.getByTestId('balance')).toHaveText('408.00 USDC');
    await new Promise((r) => setTimeout(r, 3500));
    await expect(screen.getByTestId('balance')).toHaveText('408.00 USDC');
  });

  test('a double tap on approve pays once', async ({ screen }) => {
    await say(screen, 'Send Mum 100');
    await screen.getByRole('button', 'Approve with wallet').doubleTap();
    await expect(screen.getByTestId('status')).toContainText('Sent 100 USDC to Mum');
    await expect(screen.getByTestId('balance')).toHaveText('308.00 USDC');
  });

  test('a café QR link opens as a payment request', async ({ app, screen }) => {
    await app.open('/cafe');
    await expect(screen.getByRole('image', 'QR code to pay for Flat white')).toBeVisible();
    await screen.getByRole('link', 'Open in Usual').tap();
    await expect(screen.getByTestId('understood')).toContainText('Café · Flat white');
    await app.open('/proof');
    await expect(screen.getByRole('heading', 'Proof')).toBeVisible();
    await app.open('/');
  });

  test('open questions are answered from memory', async ({ screen }) => {
    await say(screen, 'remember that the rent is due on the first');
    await expect(screen.getByTestId('say')).toContainText('Noted');
    await say(screen, 'when is the rent due?');
    await expect(screen.getByTestId('say')).toContainText('first');
  });

  test('memory off: Usual forgets Mum', async ({ screen }) => {
    await screen.getByRole('button', 'Settings').tap();
    await screen.getByRole('button', 'Memory: on').tap();
    await expect(screen.getByTestId('memory')).toContainText('0 memories');
    await screen.getByRole('button', 'Close settings').tap();
    await say(screen, 'Send Mum her usual');
    await expect(screen.getByTestId('say')).toContainText("Who's Mum?");
  });
});

// Fresh server state is shared, so this group runs after the core flows on a new memory-free path.
describe('safety and learning on a phone', { serial: true }, () => {
  test('memory comes back on after a reload', async ({ app, screen }) => {
    await app.open('/');
    await screen.getByRole('button', 'Settings').tap();
    await screen.getByRole('button', 'Memory: off').tap();
    await expect(screen.getByRole('button', 'Memory: on')).toBeVisible();
    await screen.getByRole('button', 'Close settings').tap();
  });

  test('a one-letter-off name asks, and yes pays the right person', async ({ screen }) => {
    await say(screen, 'send mun 5');
    await expect(screen.getByTestId('say')).toHaveText('Did you mean Mum?');
    await say(screen, 'yes');
    await expect(screen.getByTestId('understood')).toContainText('Mum');
    await screen.getByRole('button', 'Cancel payment').tap();
  });

  test('fifteen against a usual of fifty is asked again', async ({ screen }) => {
    await say(screen, 'send mum fifteen');
    await expect(screen.getByTestId('say')).toContainText('Did you say 15 or 50?');
  });

  test('far above the usual needs a signature even inside the limit', async ({ screen }) => {
    await say(screen, 'send mum 101');
    await expect(screen.getByTestId('understood')).toContainText('101 USDC');
    await expect(screen.getByRole('button', 'Approve with wallet')).toBeVisible();
  });

  test('a change to memory can be undone', async ({ screen }) => {
    await say(screen, 'forget Streamly');
    await expect(screen.getByTestId('say')).toContainText('Forgotten');
    await screen.getByRole('button', 'Undo').tap();
    await expect(screen.getByText('Undone.')).toBeVisible();
    await screen.getByRole('button', 'Settings').tap();
    await expect(screen.getByText('Streamly')).toBeVisible();
    await screen.getByRole('button', 'Close settings').tap();
  });

  test('settings show remembered people, limits and chain activity', async ({ screen }) => {
    await screen.getByRole('button', 'Settings').tap();
    await expect(screen.getByText('usually 50 USDC')).toBeVisible();
    await expect(screen.getByText('100 USDC a week')).toBeVisible();
    await screen.getByRole('button', 'Close settings').tap();
  });

  test('the agent loses its line when you call a payment wrong', async ({ screen }) => {
    await say(screen, 'that was wrong');
    await expect(screen.getByTestId('say')).toContainText("That's on me");
    await say(screen, 'how are you doing');
    await expect(screen.getByTestId('say')).toContainText('wrong');
  });

  test('what you said about someone stops the agent paying them', async ({ screen }) => {
    await say(screen, 'remember not to pay Mum until she confirms');
    await say(screen, 'Send Mum her usual');
    await expect(screen.getByTestId('say')).toContainText('You told me');
    await expect(screen.getByRole('button', 'Approve with wallet')).toBeVisible();
  });
});
