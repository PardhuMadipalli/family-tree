import type { Edge, Node } from '@xyflow/react';
import ELK, { ElkExtendedEdge, ElkLabel, ElkNode, ElkPort, LayoutOptions } from 'elkjs/lib/elk.bundled.js';
import { NodeType } from './nodeTypes';

const PORT_SEPARATOR = '#';

const elk = new ELK();


const commonLayoutOptions: LayoutOptions = {
  // If you enable this, hierarchical edges will not work.
  'elk.portConstraints': 'FIXED_SIDE',
  'elk.portAlignment.default': 'CENTER',
}

export const layoutWithElk = async (
  nodes: Node[],
  edges: Edge[],
  options: Record<string, string> = {}
) => {

  const layoutOptions: LayoutOptions = {
    'elk.algorithm': 'layered',
    // 'elk.debugMode': 'true',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.direction': 'DOWN',

    // Minimize layer separation
    'elk.layered.spacing.nodeNodeBetweenLayers': '50', // Reduce vertical spacing between layers
    'elk.spacing.nodeNode': '30', // Reduce horizontal spacing between nodes



    // Enable edge length minimization
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',

    // Optimize edge routing
    'elk.layered.unnecessaryBendpoints': 'true', // Remove unnecessary bends
    'elk.layered.edgeRouting.splines.mode': 'CONSERVATIVE', // Use splines for shorter paths

    // Layer assignment optimization
    'elk.layered.layering.strategy': 'LONGEST_PATH', // Best for minimizing edge lengths
    'elk.layered.layering.coffmanGraham.layerBound': '0', // No artificial layer limits

    // Node ordering within layers
    'nodePlacement.strategy': 'LINEAR_SEGMENTS', // Optimal node positioning
    'elk.layered.cycleBreaking.strategy': 'GREEDY', // Minimize feedback edges
    // 'elk.aspectRatio': '2',
    // 'elk.nodePlacement.strategy': 'LINEAR_SEGMENTS', 
    // 'elk.layering.strategy':'STRETCH_WIDTH',
    // 'elk.crossingMinimization.strategy': 'INTERACTIVE',
    // 'elk.considerModelOrder.strategy': 'PREFER_EDGES',
    // 'elk.spacing.nodeNode': '50',
    // 'elk.spacing.edgeEdge': '50',
    // 'elk.spacing.edgeNode': '50',
    // 'elk.layered.spacing.edgeEdgeBetweenLayers': '50',
    // 'elk.layered.spacing.nodeNodeBetweenLayers': '50',
    'elk.padding': '[top=20,left=20,bottom=20,right=20]',
    'elk.nodeLabels.placement': '[H_LEFT, V_TOP, INSIDE]',
    ...commonLayoutOptions,
    ...options,
  };

  // Build hierarchical ELK graph structure
  const graph = buildElkGraph(nodes, edges, layoutOptions);

  console.debug("graph", JSON.stringify(graph, null, 2));
  // Run layout
  const result = await elk.layout(graph);

  console.debug("result", result);

  // Extract positioned nodes and edges from the result
  const layoutedNodes = extractLayoutedNodes(result, nodes);
  const layoutedEdges = extractLayoutedEdges(result, edges);
  // console.log("layoutedEdges", layoutedEdges);
  return { nodes: layoutedNodes, edges: layoutedEdges };
}

function buildElkGraph(
  nodes: Node[],
  edges: Edge[],
  layoutOptions: LayoutOptions) {
  return {
    id: 'root',
    layoutOptions,
    children: nodes.map(node => nodeToElkNode(node)),
    edges: edges.map(edge => edgeToElkEdge(edge)),
  };
}


const getPorts = (node: Node): ElkPort[] => {
  const ports: ElkPort[] = [];
  ports.push(
    {
      id: `${node.id}${PORT_SEPARATOR}top`,
      properties: { side: 'NORTH' }
    }, {
    id: `${node.id}${PORT_SEPARATOR}bottom`,
    properties: { side: 'SOUTH' }
  });
  return ports;
}

function nodeToElkNode(node: Node): ElkNode {

  const ports: ElkPort[] = getPorts(node);
  const labels: ElkLabel[] = [
    {
      id: `${node.id}label`,
      text: node.data.label as string,
    }
  ];
  return {
    id: node.id,
    // Prioritize explicit width/height, then measured, then defaults
    width: node.width || node.measured?.width || 100,
    height: node.height || node.measured?.height || 59,
    ports: ports,
    labels: labels,
    layoutOptions: {
      'elk.portConstraints': 'FIXED_SIDE',
      ...commonLayoutOptions,
      ...(node.type === NodeType.Union ? {
        'elk.layered.spacing.nodeNodeBetweenLayers': '50',
        'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS',
      } : {}),
    }
  };
}

function edgeToElkEdge(edge: Edge): ElkExtendedEdge {
  const sourcePort = `${edge.source}${PORT_SEPARATOR}bottom`;
  const targetPort = `${edge.target}${PORT_SEPARATOR}top`;

  return {
    id: edge.id,
    labels: [
      // {
      //   id: `${edge.id}label`,
      //   text: edge.data?.label as string ?? '',
      //   width: 50,
      //   height: 20,
      //   layoutOptions: {}
      // }
    ],
    sources: [sourcePort],
    targets: [targetPort],
    layoutOptions: {
    }
  };
}


function extractLayoutedNodes(rootNode: ElkNode, originalNodes: Node[]): Node[] {
  const nodePositionMap = new Map<string, { x: number; y: number; }>();
  const nodeSizeMap = new Map<string, { width: number; height: number; }>();

  // Extract positions from the result recursively
  function extractPositions(elkNode: ElkNode) {
    if (elkNode.children) {
      elkNode.children.forEach((child: ElkNode) => {
        nodePositionMap.set(child.id,
          {
            x: child.x || 0,
            y: child.y || 0,
          });
        nodeSizeMap.set(child.id,
          {
            width: child.width || 0,
            height: child.height || 0
          });
        // Recursively extract positions from nested children
        if (child.children) {
          extractPositions(child);
        }
      });
    }
  }

  extractPositions(rootNode);


  // Update original nodes with new positions
  const updatedNodes = originalNodes.map(node => {
    const position = nodePositionMap.get(node.id);
    return position
      ? { ...node, position }
      : node;
  });

  updatedNodes
    .forEach(node => {
      const size = nodeSizeMap.get(node.id);
      if (size) {
        // For React Flow v12: set width and height directly for fixed dimensions
        // This will make React Flow use these as inline styles
        // node.width = size.width;
        // node.height = size.height;
        // node.initialHeight = size.height;
        // node.initialWidth = size.width;
        // node.measured = { ...node.measured, width: size.width, height: size.height };
      }
    });

  updatedNodes
    .forEach(node => {
      delete node.measured;
      delete node.style?.width;
      delete node.style?.height;
      delete node.width;
      delete node.height;
    });

  return updatedNodes
}

function extractLayoutedEdges(result: ElkNode, originalEdges: Edge[]): Edge[] {
  // Create a map from edge ID to the elk edge result for quick lookup
  // const elkEdgeMap = new Map<string, ElkExtendedEdge>();

  // // Create a map of node positions from the layout result
  // const nodePositionMap = new Map<string, { x: number; y: number; }>();

  // // Extract positions from the result recursively
  // function extractPositions(elkNode: ElkNode) {
  //   if (elkNode.children) {
  //     elkNode.children.forEach((child: ElkNode) => {
  //       nodePositionMap.set(child.id, {
  //         x: child.x || 0,
  //         y: child.y || 0,
  //       });
  //       // Recursively extract positions from nested children
  //       if (child.children) {
  //         extractPositions(child);
  //       }
  //     });
  //   }
  // }

  // extractPositions(result);

  // // Extract edges from the result recursively
  // function extractEdges(elkNode: ElkNode) {
  //   if (elkNode.edges) {
  //     elkNode.edges.forEach((elkEdge: ElkExtendedEdge) => {
  //       elkEdgeMap.set(elkEdge.id, elkEdge);
  //     });
  //   }

  //   if (elkNode.children) {
  //     elkNode.children.forEach((child: ElkNode) => {
  //       extractEdges(child);
  //     });
  //   }
  // }

  // extractEdges(result);

  return originalEdges.map(edge => {
    return {
      ...edge,
    };
  });
}