import React, { useCallback } from 'react';

type onOptionChangeFn<T> = (key: keyof T | Object) => (nextValue: React.SetStateAction<any>) => void;

/**
 * Returns a function that can apply changes with an object or a specific key in an object. When called
 * will run another function with the changes applied.
 * 
 * (Does not deep clone the object, for now)
 * 
 * @param onChange a function that receives the updated state from the change function
 * @param prevState the current (previous) state object
 * @returns a function used to apply changes to individual fields
 */
export function useBuilderOptionChanges<T>(onChange: (nextState: T) => void, prevState: T): onOptionChangeFn<T> {
  return useCallback((key: keyof T | Object) =>
    (nextValue: React.SetStateAction<any>) => {
    let nextState: T;
    if (typeof key === 'object') {
      nextState = {
        ...prevState,
        ...key,
      };
    } else {
      nextState = {
        ...prevState,
        [key]: nextValue
      };
    }
    
    onChange(nextState);
  }, [onChange, prevState]);
}
