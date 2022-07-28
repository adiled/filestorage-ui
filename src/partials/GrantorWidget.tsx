import WidgetModal from "@/components/WidgetModal";
import type { ModalWidgetProps } from "partials";

type Props = ModalWidgetProps & {
  open: boolean,
}

const GrantorWidget = ({
  open,
  onClose
}: Props) => {
  <WidgetModal
    open={open}
    onClose={onClose}
    heading="Grant allocator role"
  >

  </WidgetModal>

}

export default GrantorWidget;