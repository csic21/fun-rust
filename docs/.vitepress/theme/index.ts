import type { Zoom } from "medium-zoom";
import type { Theme } from "vitepress";
import { onContentUpdated } from "vitepress";
import DefaultTheme from "vitepress/theme-without-fonts";
import { onMounted } from "vue";
import "./custom.css";

const imageZoomSelector = ".vp-doc :not(a) > img:not(.image-src)";

let imageZoomPromise: Promise<Zoom> | undefined;

async function getImageZoom() {
  if (!imageZoomPromise) {
    imageZoomPromise = import("medium-zoom").then(({ default: mediumZoom }) =>
      mediumZoom({
        background: "var(--vp-c-bg)",
        margin: 24,
      }),
    );
  }

  return imageZoomPromise;
}

async function refreshImageZoom() {
  const zoom = await getImageZoom();
  zoom.detach();
  zoom.attach(imageZoomSelector);
}

export default {
  extends: DefaultTheme,
  setup() {
    onMounted(() => {
      void refreshImageZoom();
    });

    onContentUpdated(() => {
      void refreshImageZoom();
    });
  },
} satisfies Theme;
