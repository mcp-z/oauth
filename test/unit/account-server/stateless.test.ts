import assert from 'assert';
import { createStateless } from '../../../src/lib/account-server/stateless.ts';

describe('AccountServer.createStateless', () => {
  const service = 'gmail';

  describe('Tool: {service}-account-me', () => {
    it('returns account identity with client-managed session', async () => {
      const { tools } = createStateless({ service });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      // Simulate DCR auth context
      const extra = { authContext: { accountId: 'test@example.com' } };
      const result = await meTool.handler({}, extra);

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; service: string; email: string; sessionExpiresIn: null; message: string };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.service, 'gmail');
      assert.strictEqual(data.email, 'test@example.com');
      assert.strictEqual(data.sessionExpiresIn, null);
      assert.ok(data.message.includes('MCP client'));
    });

    it('includes correct service name in response', async () => {
      const { tools } = createStateless({ service: 'outlook' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const extra = { authContext: { accountId: 'user@outlook.com' } };
      const result = await meTool.handler({}, extra);

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { service: string };
      assert.strictEqual(data.service, 'outlook');
    });

    it('returns JSON in content field', async () => {
      const { tools } = createStateless({ service });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const extra = { authContext: { accountId: 'test@example.com' } };
      const result = await meTool.handler({}, extra);

      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0]?.type, 'text');
      const parsedContent = JSON.parse(result.content[0]?.text || '');
      assert.strictEqual(parsedContent.sessionExpiresIn, null);
    });
  });

  describe('Tool count', () => {
    it('provides exactly 1 tool', () => {
      const { tools } = createStateless({ service });
      assert.strictEqual(tools.length, 1);
    });

    it('provides exactly 0 prompts', () => {
      const { prompts } = createStateless({ service });
      assert.strictEqual(prompts.length, 0);
    });
  });

  describe('Tool naming', () => {
    it('generates tool name from service', () => {
      const { tools } = createStateless({ service: 'gmail' });
      assert.strictEqual(tools[0]?.name, 'account-me');
    });

    it('handles different service names', () => {
      const { tools: driveTools } = createStateless({ service: 'drive' });
      assert.strictEqual(driveTools[0]?.name, 'account-me');

      const { tools: sheetsTools } = createStateless({ service: 'sheets' });
      assert.strictEqual(sheetsTools[0]?.name, 'account-me');
    });
  });

  describe('Tool configuration', () => {
    it('includes description', () => {
      const { tools } = createStateless({ service });
      const meTool = tools[0];
      assert.ok(meTool);
      assert.ok(meTool.config.description);
      assert.ok(meTool.config.description.includes('user identity'));
    });

    it('has empty input schema', () => {
      const { tools } = createStateless({ service });
      const statusTool = tools[0];
      assert.ok(statusTool);
      assert.deepStrictEqual(statusTool.config.inputSchema, {});
    });

    it('has output schema with discriminated union', () => {
      const { tools } = createStateless({ service });
      const statusTool = tools[0];
      assert.ok(statusTool);
      assert.ok(statusTool.config.outputSchema);
      assert.ok(statusTool.config.outputSchema.result);
    });
  });
});
