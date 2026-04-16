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

function forceViteAllowedHosts(files: Record<string, { content: string }>) {
  // Detect if the project uses Vite by checking dependencies
  const hasVite = Object.values(files).some(file => 
    file.content.includes('"vite"') || file.content.includes("'vite'")
  );
  
  if (hasVite) {
    // Overwrite any existing vite config with a bulletproof version
    files['vite.config.js'] = {
      content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})`
    };
    files['vite.config.ts'] = {
      content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})`
    };
  }
}

app.post('/api/sandbox', async (req, res) => {
  try {
    const { files = {}, template = 'node' } = req.body as CreateSandboxRequest;
    
    console.log(`🚀 Creating sandbox with template: ${template}`);
    const sandbox = await sdk.sandboxes.create({
      template: template as any,
      privacy: 'public',
    } as any);
    console.log(`✅ Sandbox ID: ${sandbox.id}`);
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const client = await sandbox.connect();
    console.log('✅ Connected');

    if (Object.keys(files).length > 0) {
      // Force‑fix Vite config before writing
      forceViteAllowedHosts(files as any);
      
      console.log(`📝 Writing ${Object.keys(files).length} files...`);
      const writeOps = Object.entries(files).map(([path, file]) => ({
        path,
        content: (file as any).content,
      }));
      await client.fs.batchWrite(writeOps);
      console.log('✅ Files written');
    }

    const hasPackageJson = files['package.json'];
    let previewPort = 3000;
    
    if (hasPackageJson) {
      console.log('📦 Installing dependencies...');
      await client.commands.run('npm install');
      
      const pkg = JSON.parse((files['package.json'] as any).content);
      let startCommand = 'npm start';
      if (pkg.scripts?.dev) startCommand = 'npm run dev';
      else if (pkg.scripts?.start) startCommand = 'npm start';
      
      console.log(`🚀 Running: ${startCommand}`);
      client.commands.runBackground(startCommand);
      
      const portsToTry = [5173, 3000, 3001];
      for (const p of portsToTry) {
        try {
          await client.ports.waitForPort(p, { timeoutMs: 20000 });
          previewPort = p;
          break;
        } catch {}
      }
    } else {
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
