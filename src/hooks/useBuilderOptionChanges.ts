import React from 'react';

type onOptionChangeFn<T> = (key: keyof T) => (nextValue: React.SetStateAction<any>) => void;

/**
 * Returns a function that can apply changes with an object or a specific key in an object. When called
 * will run another function with the changes applied.
 * 
 * Does not deep clone the object. This is used for top level fields on the QueryBuilderOptions type.
 * 
 * @param onChange a function that receives the updated state from the change function
 * @param prevState the current (previous) state object
 * @returns a function used to apply changes to individual fields
 */
export function useBuilderOptionChanges<T>(onChange: (nextState: T) => void, prevState: T): onOptionChangeFn<T> {
  return (key: keyof T) =>
    (nextValue: React.SetStateAction<any>) => {
    const nextState: T = {
      ...prevState,
      [key]: nextValue
    };
    
    onChange(nextState);
  };
}
