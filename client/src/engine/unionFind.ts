export class UnionFind {
  private parent: Record<string, string>;
  private size: Record<string, number>;

  constructor(elements: string[]) {
    this.parent = {};
    this.size = {};
    elements.forEach((id) => {
      this.parent[id] = id;
      this.size[id] = 1;
    });
  }

  find(id: string): string {
    if (this.parent[id] === id) {
      return id;
    }
    // Path compression
    this.parent[id] = this.find(this.parent[id]);
    return this.parent[id];
  }

  union(id1: string, id2: string): boolean {
    const root1 = this.find(id1);
    const root2 = this.find(id2);

    if (root1 === root2) {
      return false;
    }

    // Union by size
    if (this.size[root1] < this.size[root2]) {
      this.parent[root1] = root2;
      this.size[root2] += this.size[root1];
    } else {
      this.parent[root2] = root1;
      this.size[root1] += this.size[root2];
    }

    return true;
  }

  getGroup(id: string): string {
    return this.find(id);
  }
  
  getSize(id: string): number {
    return this.size[this.find(id)];
  }
}
