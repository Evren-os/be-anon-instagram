// ==UserScript==
// @name         Be Anon Instagram
// @version      2.1.0
// @description  Anonymous Instagram story viewing by blocking story-seen tracking requests (XHR + Fetch)
// @license      MIT
// @author       Evrenos
// @namespace    https://github.com/Evren-os
// @match        *://www.instagram.com/*
// @run-at       document-start
// @grant        none
// @icon         https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png
// ==/UserScript==

(() => {
	if (typeof window !== "object" || typeof XMLHttpRequest !== "function") {
		return;
	}

	const PATCH_FLAG = Symbol.for("beAnon.storyPatch.v2_1_0");
	if (window[PATCH_FLAG]) {
		return;
	}
	window[PATCH_FLAG] = true;

	const XHR_URL_KEY = Symbol("beAnon.xhr.url");

	const BLOCK_PATTERNS = {
		url: [
			/\/(?:api\/v1\/)?stories\/reel\/seen(?:[/?#]|$)/i,
			/\/stories\/reel\/seen(?:[/?#]|$)/i,
		],
		directBody: [
			/\bviewSeenAt\b/i,
			/PolarisAPIReelSeenMutation|PolarisStoriesV3SeenMutation|StoriesSeenStateMutation/i,
			/\/(?:api\/v1\/)?stories\/reel\/seen/i,
		],
		seenSignalBody: [/\bseen_state\b/i, /\bstory_view(?:_attribution)?\b/i],
		storyContextBody: [/\bstor(?:y|ies)\b/i, /\breel\b/i],
	};

	const originals = {
		xhrOpen: XMLHttpRequest.prototype.open,
		xhrSend: XMLHttpRequest.prototype.send,
		fetch:
			typeof window.fetch === "function" ? window.fetch.bind(window) : null,
	};

	const hasOwn = Object.prototype.hasOwnProperty;

	function testAny(patterns, text) {
		for (let i = 0; i < patterns.length; i += 1) {
			if (patterns[i].test(text)) {
				return true;
			}
		}
		return false;
	}

	function normalizeUrl(input) {
		if (!input) {
			return "";
		}

		if (typeof input === "string") {
			return input;
		}

		if (input instanceof URL) {
			return input.href;
		}

		if (typeof input === "object" && typeof input.url === "string") {
			return input.url;
		}

		return "";
	}

	function typedArrayToString(uint8) {
		try {
			const MAX_BYTES = 8192;
			const slice =
				uint8.byteLength > MAX_BYTES ? uint8.subarray(0, MAX_BYTES) : uint8;
			if (typeof TextDecoder === "function") {
				return new TextDecoder().decode(slice);
			}
		} catch (_error) {
			// Ignore decoding errors and fall through
		}
		return "";
	}

	function formDataToString(formData) {
		const pairs = [];
		for (const [key, value] of formData.entries()) {
			if (typeof value === "string") {
				pairs.push(`${key}=${value}`);
			} else if (value && typeof value === "object" && "name" in value) {
				pairs.push(`${key}=${String(value.name)}`);
			} else {
				pairs.push(`${key}=[binary]`);
			}
		}
		return pairs.join("&");
	}

	function serializeBodySync(body) {
		if (body == null) {
			return "";
		}

		if (typeof body === "string") {
			return body;
		}

		if (body instanceof URLSearchParams) {
			return body.toString();
		}

		if (typeof FormData === "function" && body instanceof FormData) {
			return formDataToString(body);
		}

		if (body instanceof ArrayBuffer) {
			return typedArrayToString(new Uint8Array(body));
		}

		if (ArrayBuffer.isView(body)) {
			return typedArrayToString(
				new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
			);
		}

		if (typeof Blob === "function" && body instanceof Blob) {
			return `[blob:${body.type}:${body.size}]`;
		}

		if (typeof body === "object") {
			try {
				return JSON.stringify(body);
			} catch (_error) {
				return "";
			}
		}

		try {
			return String(body);
		} catch (_error) {
			return "";
		}
	}

	function shouldProbeRequestBody(url) {
		if (!url) {
			return true;
		}
		return /\b(?:stories?|reels?|graphql)\b|\/api\/v1\//i.test(url);
	}

	async function serializeRequestBody(request) {
		try {
			const method = typeof request.method === "string" ? request.method : "";
			if (/^(GET|HEAD)$/i.test(method)) {
				return "";
			}
			const clone = request.clone();
			return await clone.text();
		} catch (_error) {
			return "";
		}
	}

	function shouldBlock(url, bodyText) {
		const normalizedUrl = typeof url === "string" ? url : "";
		if (normalizedUrl && testAny(BLOCK_PATTERNS.url, normalizedUrl)) {
			return true;
		}

		if (!bodyText || typeof bodyText !== "string") {
			return false;
		}

		if (testAny(BLOCK_PATTERNS.directBody, bodyText)) {
			return true;
		}

		const hasSeenSignal = testAny(BLOCK_PATTERNS.seenSignalBody, bodyText);
		const hasStoryContext = testAny(BLOCK_PATTERNS.storyContextBody, bodyText);
		return hasSeenSignal && hasStoryContext;
	}

	function makeBlockedFetchResponse() {
		return new Response('{"status":"ok"}', {
			status: 200,
			statusText: "OK",
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Cache-Control": "no-store",
			},
		});
	}

	XMLHttpRequest.prototype.open = function (...args) {
		const url = args[1];
		try {
			this[XHR_URL_KEY] = normalizeUrl(url);
		} catch (_error) {
			// Preserve native behavior even if instrumentation fails
		}

		return originals.xhrOpen.apply(this, args);
	};

	XMLHttpRequest.prototype.send = function (...args) {
		const body = args[0];
		let bodyText = "";
		try {
			bodyText = serializeBodySync(body);
		} catch (_error) {
			bodyText = "";
		}

		const requestUrl = hasOwn.call(this, XHR_URL_KEY) ? this[XHR_URL_KEY] : "";
		if (shouldBlock(requestUrl, bodyText)) {
			return undefined;
		}

		return originals.xhrSend.apply(this, args);
	};

	if (originals.fetch) {
		window.fetch = async function (...args) {
			const resource = args[0];
			const init = args[1];
			const requestUrl = normalizeUrl(resource);
			let bodyText = "";

			const hasInitBody = !!(
				init &&
				typeof init === "object" &&
				"body" in init
			);
			if (hasInitBody) {
				bodyText = serializeBodySync(init.body);
			} else if (
				typeof Request === "function" &&
				resource instanceof Request &&
				shouldProbeRequestBody(requestUrl)
			) {
				bodyText = await serializeRequestBody(resource);
			}

			if (shouldBlock(requestUrl, bodyText)) {
				return makeBlockedFetchResponse();
			}

			return originals.fetch.apply(this, args);
		};
	}
})();
