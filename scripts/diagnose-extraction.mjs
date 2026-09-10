import { createPageRetriever } from '../lib/extraction/browser.ts';
import { websiteBoundary } from '../lib/extraction/website.ts';
import { createExtractionModel } from '../lib/extraction/model.ts';
import { contentChunks } from '../lib/extraction/content.ts';
import { extractWebsite } from '../lib/extraction/service.ts';
import { crawlForFields } from '../lib/extraction/crawl.ts';

const url = process.argv[2];
if (!url) throw new Error('Provide the URL to diagnose.');
const started = performance.now();
const log = (stage, data) => console.log(JSON.stringify({ seconds: Math.round((performance.now() - started) / 1000), stage, ...data }));
if (process.argv.includes('--service')) {
  const result = await extractWebsite({ url, prompt: 'get me the price and description for the product' }, websiteBoundary(url), AbortSignal.timeout(240000));
  log('service-result', { result });
  process.exit(0);
}
const retriever = await createPageRetriever(websiteBoundary(url));
try {
  const page = await retriever.retrieve(url);
  log('focused-content', { characters: page.focusedContent?.length, chunks: contentChunks(page.focusedContent ?? '').length });
  log('retrieved', { title: page.title, characters: page.content.length, chunks: contentChunks(page.content).length, links: page.links.length, preview: page.content.slice(0, 2500), tail: page.content.slice(-1500) });
  if (process.argv.includes('--model') || process.argv.includes('--crawl')) {
    const transport = async (...args) => {
      const request = JSON.parse(args[1].body);
      const name = request.response_format?.json_schema?.name;
      log('model-start', { name });
      const response = await fetch(...args);
      const body = await response.clone().json();
      log('model-end', { name, status: response.status, answer: body.choices?.[0]?.message?.content });
      return response;
    };
    const model = createExtractionModel(process.env.INTERFAZE_API_KEY, AbortSignal.timeout(240000), transport);
    const promptIndex = process.argv.indexOf('--prompt');
    const prompt = promptIndex < 0 ? 'get me the price and description for the product' : process.argv[promptIndex + 1];
    const plan = await model.plan(prompt);
    if (process.argv.includes('--crawl')) {
      let initial = true;
      const result = await crawlForFields(url, plan.map(field => field.name), {
        retrieve: async next => {
          log('navigate', { url: next });
          if (initial) { initial = false; return page; }
          try { return await retriever.retrieve(next); }
          catch (error) { log('navigation-failed', { url: next, message: error.message }); throw error; }
        },
        extract: (page, missing, context) => model.extract(page, missing, plan, prompt, context),
        rankLinks: (links, missing, context) => model.rankLinks(links, missing, plan, prompt, context),
        isWithinWebsite: websiteBoundary(url).isWithinWebsite,
      });
      log('crawl-result', { result });
    } else {
    const result = await model.extract(page, plan.map(field => field.name), plan, prompt, { startUrl: url, initialTitle: page.title, initialHeading: page.heading, knownFields: {} });
    log('result', { result });
    }
  }
} finally { await retriever.close(); }
