import React from "react";

/**
 * The PolyTag allows for dynamic html tag rendering via the 'as' attribute
 *
 * ### Use cases:
 * - When a layout component can render as an `ol` `ul` or `div` container
 * - For a general purpose text component <Text as='h1'>Title</Text>
 * - For a button component that can render a link with a button appearance if an href is passed
 *
 * ### Usage:
 * ```tsx
 * import { PolyTag } from "package";
 *
 * const Component = () => {
 *  return (
 *    <>
 *      <PolyTag as='ul'>
 *        <li>One</li>
 *        <li>Two</li>
 *        <li>Three</li>
 *      </PolyTag>
 *
 *     <PolyTag as='h1'>Hello World</PolyTag>
 *
 *     <PolyTag as='a' href='/foo.jpg'/>
 *    </>
 *  );
 * };
 * ```
 */
const PolyTag: PolyMorphicComponent = React.forwardRef(
  <C extends React.ElementType = "span">(
    { as, children, ...rest }: PolymorphicProps<C>,
    ref?: React.Ref<HTMLElement>
  ) => {
    const Component = as || "span";

    return (
      <Component ref={ref} {...rest}>
        {children}
      </Component>
    );
  }
) as PolyMorphicComponent;

export default PolyTag;

// type for the "ref"
export type PolymorphicRef<C extends React.ElementType> =
  React.ComponentPropsWithRef<C>["ref"];

// implements the 'as' prop for tag switching
type AsProp<C extends React.ElementType> = {
  /** the html tag to render e.g. div, img  */
  as?: C;
};

// omit props from the underlying element if they collide with our component
type PropsToOmit<C extends React.ElementType, P> = keyof (AsProp<C> & P);

// implements support for children and "ref" omits any props from the underlying element that conflict with props passed in to the component
export type PolymorphicProps<
  C extends React.ElementType,
  // eslint-disable-next-line @typescript-eslint/ban-types
  Props = {}
> = React.PropsWithChildren<Props & AsProp<C>> &
  Omit<React.ComponentPropsWithoutRef<C>, PropsToOmit<C, Props>> & {
    ref?: PolymorphicRef<C>;
  };

// the final component type
export type PolyMorphicComponent = <C extends React.ElementType = "span">(
  props: PolymorphicProps<C>
) => React.ReactElement | null;
