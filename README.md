# sequence-creator

Generate sequences of numbers or characters across multiple cursors.

Type a short expression and a preview of the generated sequence is shown before it is inserted.

## Features

- **Number sequences**: generate incrementing or decrementing numbers.
- **Character sequences**: generate alphabetic sequences (a, b, c, ...).
- **Custom step**: configure increment step and radix.
- **Padding support**: zero-pad or custom-pad output.
- **Repeat option**: repeat each value multiple times.
- **Live preview**: simulate the sequence while typing.

## Installation

To install `sequence-creator` search for _sequence-creator_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/sequence-creator`.

## Commands

Commands available in `atom-text-editor:not([mini])`:

- `sequence-creator:open`: open the sequence creator window.

## Usage

The input expression follows the syntax:

```
<start><operator><step><#radix><:padding><^repeat><flags>
```

| Key      | Default     | Definition                                                                                |
| -------- | ----------- | ----------------------------------------------------------------------------------------- |
| start    | _mandatory_ | item that you start typing, e.g. `1`, `-1`, `+1`, `21`, `a`, `ac`, `aC`                   |
| operator | `+`         | operation to calculate next step value: `+` or `-`                                        |
| step     | `1`         | integer to be added or subtracted, e.g. `2`, `-2`, `+2`                                   |
| radix    | 10          | the integer between 2 and 36 that represents radix                                        |
| padding  | _empty_     | the padding command, e.g. `<2`, ` <2`, `0<2`, `a<2`                                       |
| repeat   | 1           | an index repeat count as positive integer                                                 |
| flags    | _empty_     | a mix of letters:<br/>`!` reorder cursors by position<br/>`@` print plus sign if positive |

Examples with a cursor count of `5`:

```
Input
  => 1
  => 1+
  => 1+1

Output:
  => 1, 2, 3, 4, 5

Input
  => 1^2
  => 1+^2
  => 1+1^2

Output:
  1, 1, 2, 2, 3

Input
  => 10+2

Output:
  10, 12, 14, 16, 18

Input
  => 0027+3
  => 27+3:>4
  => 27+3:0>4

Output:
  0027, 0030, 0033, 0036, 0039

Input
  => a+2

Output:
  a, c, e, g, i

Input
  => c+20

Output:
  c, w, aq, bk, ce

Input
  => c+20:a>3

Output:
  aac, aaw, aaq, abk, ace
```

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
