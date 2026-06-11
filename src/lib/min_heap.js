// A standard binary min-heap priority queue: push(priority, value), then pop() returns the lowest-priority entry.
// It exists to keep graph search (Dijkstra) at O(E log V) instead of the O(V^2) you'd get from scanning an array
// for the minimum on every pop.
export class MinHeap {
    constructor() { this.items = []; }

    get size() { return this.items.length; }

    push(priority, value) {
        const items = this.items;
        items.push({ priority, value });
        let i = items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (items[parent].priority <= items[i].priority) break;
            [items[parent], items[i]] = [items[i], items[parent]];
            i = parent;
        }
    }

    pop() {
        const items = this.items;
        const top = items[0];
        const last = items.pop();
        if (items.length > 0) {
            items[0] = last;
            let i = 0;
            const n = items.length;
            while (true) {
                let smallest = i;
                const left = 2 * i + 1;
                const right = 2 * i + 2;
                if (left < n && items[left].priority < items[smallest].priority) smallest = left;
                if (right < n && items[right].priority < items[smallest].priority) smallest = right;
                if (smallest === i) break;
                [items[smallest], items[i]] = [items[i], items[smallest]];
                i = smallest;
            }
        }
        return top;
    }
}
