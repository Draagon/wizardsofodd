// Project-local MetaDataTypeProvider: adds an Anthropic-specific attr to the core
// `template.toolcall` subtype AND registers a project-specific
// `template.streamFrame` subtype.
//
// `template.toolcall` is a first-class MO core subtype (ADR-0011) carrying the
// vendor-agnostic attrs @toolName + @payloadRef + @description. This provider
// EXTENDS it with a wire detail specific to Anthropic's tool_use API: the
// retry-with-reminder string used when an initial tool call fails to parse
// cleanly. Future OpenAI / Mistral / MCP consumers would add their own vendor
// attrs the same way via registry.extend.
//
// @fallback (the canned payload returned on double-failure) is NOT a first-class
// attr. Under strict metadata provenance (ADR-0023) an undeclared @-attr fails
// load with ERR_UNKNOWN_ATTR, so the toolcall YAML carries the fallback on the
// registered `attr.properties` bag — the sanctioned escape hatch for arbitrary,
// author-supplied object-shaped properties, exempt from the strict-attr check.
// The structured-completion generator reads it back via attr(TEMPLATE_ATTR_FALLBACK)
// and emits it as a typed literal. (See metaobjects/toolcalls/meta-toolcall-emit-verdict.yaml.)
//
// `template.streamFrame` is a project-local subtype (not promoted to core today;
// it demonstrates the consumer-provider-extension pattern AGAIN, the same way
// template.toolcall was project-local before it graduated to core). It carries
// @eventName (wire SSE event name) + @payloadRef (the value-object the event
// carries). No @textRef requirement — a stream-frame envelope has no renderable
// body. The sse-frames generator walks every template.streamFrame node and emits
// a discriminated-union CouncilFrame type + a typed sse() helper.
//
// Wired in metaobjects.config.ts as `providers: [wizardsofoddProvider]`.

import type { MetaDataTypeProvider } from "@metaobjectsdev/metadata";
import {
  TYPE_TEMPLATE,
  TYPE_ATTR,
  ATTR_SUBTYPE_STRING,
  TEMPLATE_SUBTYPE_TOOLCALL,
  TEMPLATE_ATTR_PAYLOAD_REF,
  MetaTemplate,
  TypeId,
} from "@metaobjectsdev/metadata";

// Names exported so the generators that READ these nodes reference the SAME
// constant the provider REGISTERS — one source of truth, no declared-vs-read drift.
//
// Attrs this provider adds to the CORE template.toolcall subtype:
export const TEMPLATE_ATTR_RETRY_REMINDER = "retryReminder";
export const TEMPLATE_ATTR_FALLBACK = "fallback"; // rides the attr.properties bag, NOT a registered attr (see header)
// The project-local template.streamFrame subtype + its attr:
export const TEMPLATE_SUBTYPE_STREAM_FRAME = "streamFrame";
export const TEMPLATE_ATTR_EVENT_NAME = "eventName";

export const wizardsofoddProvider: MetaDataTypeProvider = {
  id: "wizardsofodd-anthropic-toolcall",
  dependencies: ["metaobjects-core-types"],
  description:
    "Extends core template.toolcall with an Anthropic-flavored wire attr (@retryReminder); registers the project-local template.streamFrame subtype.",
  registerTypes(registry) {
    registry.extend(TYPE_TEMPLATE, TEMPLATE_SUBTYPE_TOOLCALL, {
      attributes: [
        {
          name: TEMPLATE_ATTR_RETRY_REMINDER,
          valueType: ATTR_SUBTYPE_STRING,
          required: false,
          description:
            "Anthropic-specific: reminder string appended to the system prompt on retry when the initial tool_use call fails to parse.",
        },
      ],
    });

    // template.streamFrame — project-local subtype declaring one SSE event
    // envelope the council orchestrator emits. Mirrors template.toolcall's shape:
    // attr-only children (config carrier), no renderable text body — which is why
    // childRules allow only attrs and no @textRef is required.
    registry.register({
      typeId: new TypeId(TYPE_TEMPLATE, TEMPLATE_SUBTYPE_STREAM_FRAME),
      description:
        "SSE stream-frame envelope: pairs an @eventName wire name with a @payloadRef value-object carrying the frame's data.",
      factory: (typeId, name) => new MetaTemplate(typeId, name),
      childRules: [{ childType: TYPE_ATTR, childSubType: "*", childName: "*" }],
      attributes: [
        {
          name: TEMPLATE_ATTR_EVENT_NAME,
          valueType: ATTR_SUBTYPE_STRING,
          required: true,
          description: "Wire SSE event name (the literal string after `event: ` on the wire).",
        },
        {
          name: TEMPLATE_ATTR_PAYLOAD_REF,
          valueType: ATTR_SUBTYPE_STRING,
          required: true,
          description: "Value-object the event carries (resolved against the metamodel; drives the discriminated-union arm).",
        },
      ],
    });
  },
};
