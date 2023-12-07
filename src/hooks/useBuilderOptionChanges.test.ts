import { renderHook } from "@testing-library/react";
import { useBuilderOptionChanges } from "./useBuilderOptionChanges";

interface TestData {
  x: number;
  y: number;
}

describe('useBuilderOptionChanges', () => {
  it('calls onChange with merged object', async () => {
    const onChange = jest.fn();
    const prevState: TestData = {
      x: 1,
      y: 2
    };
    const hook = renderHook(() => useBuilderOptionChanges<TestData>(onChange, prevState));
    const applyChanges = hook.result.current;
    
    
    expect(applyChanges).not.toBeUndefined();
    applyChanges('y')(3);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ x: 1, y: 3 });
  });
});
