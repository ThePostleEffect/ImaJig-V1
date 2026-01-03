import { Piece, Pose } from './types';
import { composePose, distance } from './pose';

const SNAP_ROTATION_THRESHOLD = 0.2; // radians (~11 degrees)

export interface SnapResult {
  snapped: boolean;
  targetPose?: Pose;
  targetPieceId?: string;
}

export function checkSnap(
  draggedPiece: Piece,
  candidatePieces: Piece[],
  snapDistanceThreshold: number = 20
): SnapResult {
  for (const candidate of candidatePieces) {
    // Check if these pieces are neighbors
    const neighborInfo = draggedPiece.neighbors.find(
      (n) => n.otherId === candidate.id
    );

    if (!neighborInfo) continue;

    // Calculate where the dragged piece SHOULD be relative to the candidate
    // If candidate is at P_c, and dragged piece is P_d relative to candidate (deltaPose)
    // Then expected P_d_world = P_c * deltaPose
    // Note: neighborInfo.deltaPose is "other relative to this", so we need inverse
    // Wait, let's clarify definition:
    // neighbors[] with { otherId, deltaPose }
    // usually deltaPose is position of neighbor relative to self.
    // So P_neighbor = P_self * deltaPose
    // => P_self = P_neighbor * invert(deltaPose)
    
    // Let's assume deltaPose in Neighbor struct is: Pose of 'otherId' in 'this' local space.
    // So P_other_world = P_this_world * deltaPose
    // We want to snap 'this' (draggedPiece) to 'other' (candidate)
    // So P_this_world = P_other_world * invert(deltaPose)
    
    // However, let's look at how we generate it.
    // Usually easier to store: expected offset.
    
    // Let's use the definition:
    // neighbor.deltaPose = pose of neighbor relative to self.
    // So if we are snapping Self to Neighbor:
    // Self should be at Neighbor * invert(deltaPose)
    
    // BUT, we need to handle rotation carefully.
    // Let's simplify: We check if the current relative pose is close to expected relative pose.
    
    // Current relative pose of candidate in draggedPiece's frame:
    // P_rel_current = invert(P_dragged) * P_candidate
    
    // Expected relative pose of candidate in draggedPiece's frame:
    // P_rel_expected = neighborInfo.deltaPose
    
    // Actually, let's stick to world space distance for simplicity.
    // Expected Dragged World Pose = Candidate World Pose * Invert(Neighbor Delta Pose)
    
    // Let's assume neighbor.deltaPose is "Pose of Neighbor relative to Self"
    // P_n = P_s * D_sn
    // P_s = P_n * inv(D_sn)
    
    // We need to implement invertPose and composePose correctly in pose.ts (already done)
    
    // Let's re-verify pose composition order.
    // composePose(parent, child) applies parent transform to child.
    
    // So:
    // const invDelta = invertPose(neighborInfo.deltaPose);
    // const expectedPose = composePose(candidate.currentPose, invDelta);
    
    // Wait, if D_sn is neighbor relative to self.
    // Then P_n = composePose(P_s, D_sn)
    // We know P_n (candidate.currentPose). We want P_s.
    // P_s = composePose(P_n, invertPose(D_sn)) ?? 
    // Let's trace:
    // P_s * D_sn means: take D_sn, rotate by R_s, translate by T_s.
    // P_n = R_s * D_sn.p + T_s
    // We want T_s, R_s.
    // This is not a simple composition if we just invert D_sn.
    
    // Let's try a simpler approach for the prototype:
    // We know the "Correct Pose" (solved state) for every piece: P_correct_i
    // The relative transform between any two pieces i and j is CONSTANT.
    // T_ij = inv(P_correct_i) * P_correct_j
    
    // So if we snap i to j:
    // P_i_expected = P_j_current * inv(T_ij)
    // P_i_expected = P_j_current * inv(inv(P_correct_i) * P_correct_j)
    // P_i_expected = P_j_current * inv(P_correct_j) * P_correct_i
    
    // This is robust! We don't even need to store explicit deltaPoses in neighbors if we have correctPose.
    // But the prompt says "neighbors[] with { otherId, deltaPose, edgeKey }".
    // We will use the correctPose derived math for robustness, but validate against neighbor list to ensure we only snap valid neighbors.
    
    // 1. Calculate expected pose of draggedPiece based on candidate
    // T_c_to_d = inv(candidate.correctPose) * draggedPiece.correctPose
    // This is the transform from candidate to dragged in "solved space"
    // We apply this same relative transform to the current candidate pose.
    
    // Wait, composePose(A, B) = A applied to B.
    // P_world = composePose(Origin, P_local)
    
    // Relative transform T_rel = composePose(invertPose(candidate.correctPose), draggedPiece.correctPose)
    // expectedPose = composePose(candidate.currentPose, T_rel)
    
    // Let's verify this logic.
    // If candidate is at correctPose, then expectedPose = composePose(correctPose, inv(correctPose) * draggedCorrect) = draggedCorrect. Correct.
    // If candidate is shifted by D, expectedPose should be shifted by D. Correct.
    
    // So we need to import composePose and invertPose.
    
    const relativeTransform = composePose(
      invertPose(candidate.correctPose),
      draggedPiece.correctPose
    );
    
    const expectedPose = composePose(candidate.currentPose, relativeTransform);
    
    // Check distance
    const dist = distance(
      { x: draggedPiece.currentPose.x, y: draggedPiece.currentPose.y },
      { x: expectedPose.x, y: expectedPose.y }
    );
    
    // Check rotation difference
    let rotDiff = Math.abs(draggedPiece.currentPose.rotation - expectedPose.rotation);
    // Normalize to -PI to PI
    while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
    while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
    rotDiff = Math.abs(rotDiff);

    if (dist < snapDistanceThreshold && rotDiff < SNAP_ROTATION_THRESHOLD) {
      return {
        snapped: true,
        targetPose: expectedPose,
        targetPieceId: candidate.id,
      };
    }
  }

  return { snapped: false };
}

function invertPose(pose: Pose): Pose {
  const cos = Math.cos(pose.rotation);
  const sin = Math.sin(pose.rotation);
  
  const x = -(pose.x * cos + pose.y * sin);
  const y = -(-pose.x * sin + pose.y * cos);
  const rotation = -pose.rotation;
  
  return { x, y, rotation };
}
