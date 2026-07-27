<script lang="ts">
  import { slide } from "svelte/transition";

  interface Props {
    delay?: number;
    animationDirection?: "horizontal" | "vertical";
  }
  const { delay, animationDirection }: Props = $props();

  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const axis = $derived(animationDirection === "horizontal" ? ("x" as const) : ("y" as const));
</script>

<div
  class="loader"
  in:slide={{ duration: reduced ? 0 : 200, delay, axis }}
  out:slide={{ duration: reduced ? 0 : 200, axis }}
>
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M22 1.375C20.4812 1.375 19.25 2.60622 19.25 4.125V12.375C19.25 13.8938 20.4812 15.125 22 15.125C23.5188 15.125 24.75 13.8938 24.75 12.375V4.125C24.75 2.60622 23.5188 1.375 22 1.375ZM36.5841 7.41593C35.5101 6.34198 33.7689 6.34198 32.695 7.41593L26.8614 13.2496C25.7874 14.3235 25.7874 16.0647 26.8614 17.1386C27.9353 18.2126 29.6765 18.2126 30.7504 17.1386L36.5841 11.305C37.658 10.2311 37.658 8.48987 36.5841 7.41593ZM39.875 19.25C41.3938 19.25 42.625 20.4812 42.625 22C42.625 23.5188 41.3938 24.75 39.875 24.75H31.625C30.1062 24.75 28.875 23.5188 28.875 22C28.875 20.4812 30.1062 19.25 31.625 19.25H39.875ZM36.5841 36.5841C37.658 35.5101 37.658 33.7689 36.5841 32.695L30.7504 26.8614C29.6765 25.7874 27.9353 25.7874 26.8614 26.8614C25.7874 27.9353 25.7874 29.6765 26.8614 30.7504L32.695 36.5841C33.7689 37.658 35.5101 37.658 36.5841 36.5841ZM19.25 31.625C19.25 30.1062 20.4812 28.875 22 28.875C23.5188 28.875 24.75 30.1062 24.75 31.625V39.875C24.75 41.3938 23.5188 42.625 22 42.625C20.4812 42.625 19.25 41.3938 19.25 39.875V31.625ZM17.1387 26.8614C16.0647 25.7874 14.3235 25.7874 13.2496 26.8614L7.41594 32.695C6.34199 33.769 6.34199 35.5102 7.41594 36.5841C8.48988 37.658 10.2311 37.658 11.305 36.5841L17.1387 30.7505C18.2126 29.6765 18.2126 27.9353 17.1387 26.8614ZM12.375 19.25C13.8938 19.25 15.125 20.4812 15.125 22C15.125 23.5188 13.8938 24.75 12.375 24.75H4.125C2.60622 24.75 1.375 23.5188 1.375 22C1.375 20.4812 2.60622 19.25 4.125 19.25H12.375ZM17.1387 17.1386C18.2126 16.0647 18.2126 14.3235 17.1387 13.2495L11.305 7.41589C10.2311 6.34195 8.48988 6.34195 7.41594 7.41589C6.342 8.48984 6.342 10.231 7.41594 11.305L13.2496 17.1386C14.3235 18.2126 16.0647 18.2126 17.1387 17.1386Z"
      fill="white"
    />
  </svg>
</div>

<style>
  .loader {
    --size: 1.25rem;
    height: var(--size);
    width: var(--size);
    mask-image: conic-gradient(from 20deg, transparent, white);
    animation: loading 0.8s steps(8) forwards infinite;
    display: inline-flex;

    & svg {
      width: 100%;
      height: 100%;
    }
    & svg path {
      fill: var(--color-loader, currentColor);
    }
  }

  @keyframes loading {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(359deg);
    }
  }
</style>
