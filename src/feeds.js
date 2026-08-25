import epochAi from "./sources/epoch-ai";

export const SOURCES = [epochAi];

export const findSource = (slug) => SOURCES.find((s) => s.slug === slug);
