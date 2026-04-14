import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { CodeSandbox } from '@codesandbox/sdk';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const sdk = new CodeSandbox(process.env.CSB_API_KEY!);

interface CreateSandboxRequest {
  files?: Record<string, { content: string }>;
  template?: string;
}

app.post('/api/sandbox', async (req, res) => {
  try {
    const { files, template = 'node' } = req.body as CreateSandboxRequest;
    
    console.log(`🚀 Creating sandbox with template: ${template}`);
    const sandbox = await sdk.sandboxes.create({
      template: template as any,
      privacy: 'public',
    } as any);
    console.log(`✅ Sandbox created, ID: ${sandbox.id}`);
    
    console.log('⏳ Waiting 5 seconds for VM to initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🔌 Connecting to sandbox...');
    const client = await sandbox.connect();
    console.log('✅ Connected');

    if (files && Object.keys(files).length > 0) {
      console.log(`📝 Writing ${Object.keys(files).length} files...`);
      const writeOps = Object.entries(files).map(([path, file]) => ({
        path,
        content: file.content,
      }));
      await client.fs.batchWrite(writeOps);
      console.log('✅ Files written');
    }

    const hasPackageJson = files && files['package.json'];
    let previewPort = 3000;
    
    if (hasPackageJson) {
      console.log('📦 Installing dependencies...');
      await client.commands.run('npm install');
      
      const pkg = JSON.parse(files!['package.json'].content);
      let startCommand = 'npm start';
      if (pkg.scripts?.dev) startCommand = 'npm run dev';
      else if (pkg.scripts?.start) startCommand = 'npm start';
      
      console.log(`🚀 Running: ${startCommand}`);
      client.commands.runBackground(startCommand);
      
      const portsToTry = [5173, 3000, 3001];
      for (const p of portsToTry) {
        try {
          console.log(`⏳ Waiting for port ${p}...`);
          await client.ports.waitForPort(p, { timeoutMs: 20000 });
          previewPort = p;
          console.log(`✅ Port ${p} is ready`);
          break;
        } catch (e) {
          console.log(`❌ Port ${p} not ready`);
        }
      }
    } else {
      console.log('📄 Static project – using npx serve...');
      client.commands.runBackground('npx --yes serve . -l 3000');
      await client.ports.waitForPort(3000, { timeoutMs: 30000 });
      previewPort = 3000;
    }

    const previewUrl = `https://${sandbox.id}-${previewPort}.csb.app`;
    console.log(`🌐 Preview URL: ${previewUrl}`);
    res.json({ sandboxId: sandbox.id, previewUrl });
  } catch (error: any) {
    console.error('🔥 Failed:', error.message);
    res.status(500).json({ error: 'Failed to create sandbox', details: error.message });
  }
});

app.listen(port, () => console.log(`🚀 Server on port ${port}`));
