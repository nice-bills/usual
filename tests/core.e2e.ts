import { describe, test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
const say = async (screen: Screen, text: string) => {
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
    await say(screen, "that's my gym");
    await expect(screen.getByTestId('say')).toContainText('Gym: 35 USDC a month, up from 30.');
    await say(screen, "It's Streamly, a streaming subscription");
    await expect(screen.getByTestId('say')).toContainText('Streamly: 12 USDC a month.');
  });

  test('send Mum her usual: understood line, then the agent pays inside the family allowance', async ({ screen }) => {
    await say(screen, 'Send Mum her usual');
    await expect(screen.getByTestId('heard')).toContainText('Send Mum her usual');
    await expect(screen.getByTestId('understood')).toHaveText('Understood as: 50 USDC to Mum (0x33…33), like the last 3 times · balance after: 412.50');
    await expect(screen.getByTestId('status')).toContainText('Sent 50 USDC to Mum.', { timeout: 10_000 });
    await expect(screen.getByTestId('balance')).toHaveText('412.50 USDC');
  });

  test('the café over the food limit needs the owner, then pays over MPP', async ({ screen }) => {
    await screen.getByText('Demo controls').tap();
    await screen.getByRole('button', 'Café: flat white').tap();
    await expect(screen.getByTestId('say')).toContainText('over your food limit');
    await screen.getByRole('button', 'Sign with wallet').tap();
    await expect(screen.getByTestId('status')).toContainText('Paid the café 4.50.');
  });

  test('unknown people get a question, not a guess', async ({ screen }) => {
    await say(screen, 'send Dad 20');
    await expect(screen.getByTestId('say')).toHaveText("Usual: Who's Dad?");
  });

  test('spending summary spots the price rise and offers to cancel', async ({ screen }) => {
    await say(screen, 'What am I wasting money on?');
    await expect(screen.getByTestId('say')).toContainText('Your gym went from 30 to 35');
    await expect(screen.getByTestId('say')).toContainText('Cancel Streamly?');
    await say(screen, 'yes');
    await expect(screen.getByTestId('say')).toContainText('Streamly is marked cancelled');
  });

  test('memory off: Usual forgets Mum', async ({ screen }) => {
    await screen.getByRole('button', 'Memory: on').tap();
    await expect(screen.getByTestId('memory')).toContainText('0 memories');
    await say(screen, 'Send Mum her usual');
    await expect(screen.getByTestId('say')).toHaveText("Usual: Who's Mum?");
    await screen.getByRole('button', 'Memory: off').tap();
  });
});
