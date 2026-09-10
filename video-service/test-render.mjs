import { renderMarketingVideo } from "./render.js";

const result = await renderMarketingVideo(
  "/tmp/testassets/test.mp4",
  "/tmp/testassets/service_test_output.mp4",
);
console.log(JSON.stringify(result, null, 2));
