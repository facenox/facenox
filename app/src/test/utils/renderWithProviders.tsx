import { StrictMode, type PropsWithChildren, type ReactElement } from "react"
import { render, type RenderOptions } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DialogProvider } from "@/components/shared/DialogProvider"

type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  strictMode?: boolean
  withDialogProvider?: boolean
}

export function renderWithProviders(
  ui: ReactElement,
  {
    strictMode = false,
    withDialogProvider = true,
    ...renderOptions
  }: RenderWithProvidersOptions = {},
) {
  function Wrapper({ children }: PropsWithChildren) {
    let content = children

    if (withDialogProvider) {
      content = <DialogProvider>{content}</DialogProvider>
    }

    if (strictMode) {
      content = <StrictMode>{content}</StrictMode>
    }

    return <>{content}</>
  }

  return {
    user: userEvent.setup(),
    ...render(ui, {
      wrapper: Wrapper,
      ...renderOptions,
    }),
  }
}
