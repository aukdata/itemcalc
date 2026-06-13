import type {
  AuthoredProductionLine,
  CompiledTargetOutput,
  Diagnostic,
  EditorDocument,
  EditorEndpoint,
  MaterialNetwork,
  MaterialRef,
  ProductionLine
} from "../../../domain/production-line/types";

interface ResolvedEndpoint {
  endpoint: EditorEndpoint;
  entityId: string;
  material: MaterialRef;
}

export interface GraphCompileResult {
  line?: ProductionLine;
  diagnostics: Diagnostic[];
}

function materialKey(material: MaterialRef): string {
  return `${material.kind}:${material.name.trim()}`;
}

function endpointKey(endpoint: EditorEndpoint): string {
  switch (endpoint.endpointType) {
    case "processInput":
    case "processOutput":
      return `${endpoint.endpointType}:${endpoint.nodeId}:${endpoint.portId}`;
    default:
      return `${endpoint.endpointType}:${endpoint.nodeId}`;
  }
}

function makeError(
  code: string,
  message: string,
  entityIds: string[],
  details?: Record<string, string | number>
): Diagnostic {
  return {
    code,
    severity: "error",
    message,
    entityIds,
    ...(details === undefined ? {} : { details })
  };
}

function resolveEndpoint(
  line: AuthoredProductionLine,
  editor: EditorDocument,
  endpoint: EditorEndpoint
): ResolvedEndpoint | Diagnostic {
  const node = editor.nodes.find((candidate) => candidate.id === endpoint.nodeId);

  if (node === undefined) {
    return makeError(
      "ENDPOINT_NOT_FOUND",
      `Editor node '${endpoint.nodeId}' was not found.`,
      [endpoint.nodeId]
    );
  }

  switch (endpoint.endpointType) {
    case "processInput": {
      const process = line.processes.find((candidate) => candidate.id === node.entityId);
      const port = process?.inputs.find((candidate) => candidate.id === endpoint.portId);

      if (process === undefined || port === undefined) {
        return makeError(
          "ENDPOINT_NOT_FOUND",
          `Process input '${endpoint.portId}' was not found.`,
          [node.entityId, endpoint.portId]
        );
      }

      return { endpoint, entityId: process.id, material: port.material };
    }
    case "processOutput": {
      const process = line.processes.find((candidate) => candidate.id === node.entityId);
      const port = process?.outputs.find((candidate) => candidate.id === endpoint.portId);

      if (process === undefined || port === undefined) {
        return makeError(
          "ENDPOINT_NOT_FOUND",
          `Process output '${endpoint.portId}' was not found.`,
          [node.entityId, endpoint.portId]
        );
      }

      return { endpoint, entityId: process.id, material: port.material };
    }
    case "externalInput": {
      const external = line.externalInputs.find((candidate) => candidate.id === node.entityId);

      if (external === undefined) {
        return makeError(
          "ENDPOINT_NOT_FOUND",
          `External input '${node.entityId}' was not found.`,
          [node.entityId]
        );
      }

      return { endpoint, entityId: external.id, material: external.material };
    }
    case "targetOutput": {
      const target = line.targets.find((candidate) => candidate.id === node.entityId);

      if (target === undefined) {
        return makeError(
          "ENDPOINT_NOT_FOUND",
          `Target '${node.entityId}' was not found.`,
          [node.entityId]
        );
      }

      return { endpoint, entityId: target.id, material: target.material };
    }
    case "disposal": {
      const disposal = line.disposals.find((candidate) => candidate.id === node.entityId);

      if (disposal === undefined) {
        return makeError(
          "ENDPOINT_NOT_FOUND",
          `Disposal '${node.entityId}' was not found.`,
          [node.entityId]
        );
      }

      return { endpoint, entityId: disposal.id, material: disposal.material };
    }
  }
}

function isValidDirection(source: EditorEndpoint, target: EditorEndpoint): boolean {
  return (
    (source.endpointType === "processOutput" &&
      (target.endpointType === "processInput" ||
        target.endpointType === "targetOutput" ||
        target.endpointType === "disposal")) ||
    (source.endpointType === "externalInput" &&
      (target.endpointType === "processInput" || target.endpointType === "targetOutput"))
  );
}

export function compileMaterialNetworks(
  line: AuthoredProductionLine,
  editor: EditorDocument
): GraphCompileResult {
  const diagnostics: Diagnostic[] = [];
  const edgeByEndpoint = new Map<string, string[]>();

  for (const edge of editor.edges) {
    if (!isValidDirection(edge.source, edge.target)) {
      diagnostics.push(
        makeError(
          "INVALID_EDGE_DIRECTION",
          `Edge '${edge.id}' uses an unsupported direction.`,
          [edge.id]
        )
      );
      continue;
    }

    const sourceKey = endpointKey(edge.source);
    const targetKey = endpointKey(edge.target);

    edgeByEndpoint.set(sourceKey, [...(edgeByEndpoint.get(sourceKey) ?? []), edge.id]);
    edgeByEndpoint.set(targetKey, [...(edgeByEndpoint.get(targetKey) ?? []), edge.id]);
  }

  for (const process of line.processes) {
    for (const input of process.inputs) {
      const key = endpointKey({
        nodeId:
          editor.nodes.find(
            (candidate) => candidate.kind === "process" && candidate.entityId === process.id
          )?.id ?? process.id,
        endpointType: "processInput",
        portId: input.id
      });
      if ((edgeByEndpoint.get(key) ?? []).length === 0) {
        diagnostics.push(
          makeError(
            "PORT_NOT_CONNECTED",
            `Process input '${input.id}' is not connected.`,
            [process.id, input.id]
          )
        );
      }
    }

    for (const output of process.outputs) {
      const key = endpointKey({
        nodeId:
          editor.nodes.find(
            (candidate) => candidate.kind === "process" && candidate.entityId === process.id
          )?.id ?? process.id,
        endpointType: "processOutput",
        portId: output.id
      });
      if ((edgeByEndpoint.get(key) ?? []).length === 0) {
        diagnostics.push(
          makeError(
            "PORT_NOT_CONNECTED",
            `Process output '${output.id}' is not connected.`,
            [process.id, output.id]
          )
        );
      }
    }
  }

  const adjacency = new Map<string, Set<string>>();
  const resolvedByEndpoint = new Map<string, ResolvedEndpoint>();

  for (const edge of editor.edges) {
    const source = resolveEndpoint(line, editor, edge.source);
    const target = resolveEndpoint(line, editor, edge.target);

    if ("code" in source) {
      diagnostics.push(source);
      continue;
    }

    if ("code" in target) {
      diagnostics.push(target);
      continue;
    }

    if (materialKey(source.material) !== materialKey(target.material)) {
      diagnostics.push(
        makeError(
          "MATERIAL_MISMATCH",
          `Edge '${edge.id}' connects incompatible materials.`,
          [edge.id, source.entityId, target.entityId]
        )
      );
      continue;
    }

    if (materialKey(source.material) !== materialKey(edge.material)) {
      diagnostics.push(
        makeError(
          "MATERIAL_MISMATCH",
          `Edge '${edge.id}' material does not match its source endpoint.`,
          [edge.id, source.entityId]
        )
      );
      continue;
    }

    const sourceKey = endpointKey(edge.source);
    const targetKey = endpointKey(edge.target);

    resolvedByEndpoint.set(sourceKey, source);
    resolvedByEndpoint.set(targetKey, target);

    adjacency.set(sourceKey, new Set([...(adjacency.get(sourceKey) ?? []), targetKey]));
    adjacency.set(targetKey, new Set([...(adjacency.get(targetKey) ?? []), sourceKey]));
  }

  if (diagnostics.length > 0) {
    return { diagnostics };
  }

  const visited = new Set<string>();
  const networks: MaterialNetwork[] = [];
  const compiledTargets: CompiledTargetOutput[] = [];

  for (const start of adjacency.keys()) {
    if (visited.has(start)) {
      continue;
    }

    const queue = [start];
    const component = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined || visited.has(current)) {
        continue;
      }

      visited.add(current);
      component.add(current);

      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          queue.push(next);
        }
      }
    }

    const endpoints = [...component].map((key) => resolvedByEndpoint.get(key)).filter(Boolean) as
      ResolvedEndpoint[];
    const componentMaterial = endpoints[0]?.material;

    if (componentMaterial === undefined) {
      continue;
    }

    const producers: MaterialNetwork["producers"] = [];
    const consumers: MaterialNetwork["consumers"] = [];
    const targetIds: string[] = [];
    const externalIds: string[] = [];
    const disposalIds: string[] = [];

    for (const resolved of endpoints) {
      switch (resolved.endpoint.endpointType) {
        case "processOutput":
          producers.push({
            processId: resolved.entityId,
            outputId: resolved.endpoint.portId
          });
          break;
        case "processInput":
          consumers.push({
            processId: resolved.entityId,
            inputId: resolved.endpoint.portId
          });
          break;
        case "targetOutput":
          targetIds.push(resolved.entityId);
          break;
        case "externalInput":
          externalIds.push(resolved.entityId);
          break;
        case "disposal":
          disposalIds.push(resolved.entityId);
          break;
      }
    }

    if (externalIds.length > 1) {
      diagnostics.push(
        makeError(
          "MULTIPLE_EXTERNAL_INPUTS",
          "A network may have at most one external input.",
          externalIds
        )
      );
      continue;
    }

    if (disposalIds.length > 1) {
      diagnostics.push(
        makeError("MULTIPLE_DISPOSALS", "A network may have at most one disposal.", disposalIds)
      );
      continue;
    }

    const endpointIds = [...component].sort();
    const networkId = `network:${endpointIds.join("|")}`;

    const externalInputNode = externalIds[0]
      ? line.externalInputs.find((candidate) => candidate.id === externalIds[0])
      : undefined;
    const disposalNode = disposalIds[0]
      ? line.disposals.find((candidate) => candidate.id === disposalIds[0])
      : undefined;

    networks.push({
      id: networkId,
      material: componentMaterial,
      producers,
      consumers,
      externalInput: {
        enabled: externalInputNode !== undefined,
        ...(externalInputNode?.maximumFlowPerTick === undefined
          ? {}
          : { maximumFlowPerTick: externalInputNode.maximumFlowPerTick }),
        ...(externalInputNode?.costPerUnit === undefined
          ? {}
          : { costPerUnit: externalInputNode.costPerUnit }),
        ...(externalInputNode === undefined ? {} : { sourceNodeId: externalInputNode.id })
      },
      disposal: {
        enabled: disposalNode !== undefined,
        ...(disposalNode === undefined ? {} : { nodeId: disposalNode.id })
      }
    });

    for (const targetId of targetIds) {
      const target = line.targets.find((candidate) => candidate.id === targetId);
      if (target === undefined) {
        continue;
      }

      compiledTargets.push({
        ...target,
        networkId
      });
    }
  }

  for (const target of line.targets) {
    if (!compiledTargets.some((candidate) => candidate.id === target.id)) {
      diagnostics.push(
        makeError(
          "TARGET_NOT_CONNECTED",
          `Target '${target.id}' is not connected to any network.`,
          [target.id]
        )
      );
    }
  }

  if (diagnostics.length > 0) {
    return { diagnostics };
  }

  return {
    line: {
      ...line,
      targets: compiledTargets,
      networks
    },
    diagnostics
  };
}
