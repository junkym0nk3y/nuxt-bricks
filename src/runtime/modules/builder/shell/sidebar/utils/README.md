# builder/shell/sidebar/utils

| File                          | Purpose                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `componentCategories.ts`      | Grouping the library components by category for the sidebar (a Map, so that a category never becomes a key of an object)   |
| `normalizeVariantProps.ts`    | Normalizing the data of a variant into the props of an editor component (select/switch/the base shape + min/max/step/unit) |
| `propertyEditorComponents.ts` | The map "a property type → an async editor component" for the properties panel                                             |
| `propertyFormatters.ts`       | Formatting the property values for display                                                                                 |
| `propertyValueCoercion.ts`    | Coercing the string input into the types of the property values (arrays of primitives and the like)                        |
| `variantBuilders.ts`          | The registry of the property variant builders (`VARIANT_BUILDERS`) + the select heuristic and the input fallback           |
